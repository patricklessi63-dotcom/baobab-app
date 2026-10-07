import { describe, it, expect, vi } from "vitest";
import {
  ANDROID_CHANNEL_ID,
  buildApnsBody,
  buildFcmMessage,
  classifyApnsResponse,
  classifyFcmResponse,
  createNativePushClient,
  deepLinkPathFor,
  isCategoryEnabled,
  loadNativePushConfig,
  normalizeNotification,
  parseFcmServiceAccount,
  sanitizeUrlPath,
  signJwt,
} from "./nativePush";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

function toPem(der: ArrayBuffer, label = "PRIVATE KEY") {
  const b64 = Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}
function b64urlToBytes(s: string) {
  return new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}
async function rsaKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  return { pem: toPem(await crypto.subtle.exportKey("pkcs8", kp.privateKey)), publicKey: kp.publicKey };
}
async function ecKeyPair() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { pem: toPem(await crypto.subtle.exportKey("pkcs8", kp.privateKey)), publicKey: kp.publicKey };
}
const decodePart = (jwt: string, i: number) => JSON.parse(Buffer.from(b64urlToBytes(jwt.split(".")[i])).toString("utf8"));

describe("contenu des notifications natives", () => {
  it("construit le message FCM : notification système + data.url (chaînes) + canal Android", () => {
    const m = buildFcmMessage("tok", { title: "T", body: "B", url: "/messages/" + UUID });
    expect(m).toEqual({
      message: {
        token: "tok",
        notification: { title: "T", body: "B" },
        data: { url: "/messages/" + UUID },
        android: { priority: "HIGH", notification: { channel_id: ANDROID_CHANNEL_ID } },
      },
    });
    // FCM v1 : toutes les valeurs de `data` doivent être des chaînes.
    expect(Object.values(m.message.data).every((v) => typeof v === "string")).toBe(true);
  });

  it("construit le corps APNs (alerte visible, url à la racine)", () => {
    expect(buildApnsBody({ title: "T", body: "B", url: "/" })).toEqual({
      aps: { alert: { title: "T", body: "B" }, sound: "default" },
      url: "/",
    });
  });

  it("deepLinkPathFor : liste blanche, id validé (uuid), repli sur /", () => {
    expect(deepLinkPathFor("message", UUID)).toBe(`/messages/${UUID}`);
    expect(deepLinkPathFor("match", UUID.toUpperCase())).toBe(`/messages/${UUID}`);
    expect(deepLinkPathFor("like", UUID)).toBe(`/profile/${UUID}`);
    expect(deepLinkPathFor("follow", UUID)).toBe(`/profile/${UUID}`);
    expect(deepLinkPathFor("message", "../../etc")).toBe("/");
    expect(deepLinkPathFor("message", `${UUID}/../x`)).toBe("/");
    expect(deepLinkPathFor("message", undefined)).toBe("/");
    expect(deepLinkPathFor("autre" as never, UUID)).toBe("/");
  });

  it("sanitizeUrlPath refuse tout ce qui n'est pas un chemin relatif simple", () => {
    expect(sanitizeUrlPath("/event/abc")).toBe("/event/abc");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/a\nb", "", "x".repeat(300), 42, null]) {
      expect(sanitizeUrlPath(bad)).toBe("/");
    }
  });

  it("normalizeNotification tronque et applique les valeurs par défaut", () => {
    const n = normalizeNotification({ title: "", body: "x".repeat(500), url: "//evil" });
    expect(n.title).toBe("Baobab");
    expect(n.body.length).toBe(240);
    expect(n.url).toBe("/");
  });

  it("isCategoryEnabled : mêmes règles que le Web Push (seul `false` explicite désactive)", () => {
    expect(isCategoryEnabled(null, "messages")).toBe(true);
    expect(isCategoryEnabled({}, "messages")).toBe(true);
    expect(isCategoryEnabled({ messages: true }, "messages")).toBe(true);
    expect(isCategoryEnabled({ messages: false }, "messages")).toBe(false);
    expect(isCategoryEnabled({ messages: false }, "likes")).toBe(true);
  });
});

describe("mapping des erreurs -> suppression du jeton", () => {
  it("FCM : UNREGISTERED / NOT_FOUND / 404 => invalid_token", () => {
    expect(classifyFcmResponse(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } })).toBe("invalid_token");
    expect(classifyFcmResponse(400, { error: { details: [{ errorCode: "UNREGISTERED" }] } })).toBe("invalid_token");
    expect(classifyFcmResponse(404, null)).toBe("invalid_token");
  });
  it("FCM : INVALID_ARGUMENT et SENDER_ID_MISMATCH ne suppriment PAS le jeton", () => {
    expect(classifyFcmResponse(400, { error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "INVALID_ARGUMENT" }] } })).toBe("error");
    expect(classifyFcmResponse(403, { error: { details: [{ errorCode: "SENDER_ID_MISMATCH" }] } })).toBe("auth");
  });
  it("FCM : ok / auth / retry", () => {
    expect(classifyFcmResponse(200, null)).toBe("ok");
    expect(classifyFcmResponse(401, { error: { status: "UNAUTHENTICATED" } })).toBe("auth");
    expect(classifyFcmResponse(503, null)).toBe("retry");
    expect(classifyFcmResponse(429, null)).toBe("retry");
  });
  it("APNs : Unregistered/410 => invalid_token ; BadDeviceToken => à confirmer ; mauvais topic => pas de suppression", () => {
    expect(classifyApnsResponse(410, "Unregistered")).toBe("invalid_token");
    expect(classifyApnsResponse(400, "BadDeviceToken")).toBe("bad_device_token");
    expect(classifyApnsResponse(400, "DeviceTokenNotForTopic")).toBe("error");
    expect(classifyApnsResponse(403, "ExpiredProviderToken")).toBe("auth");
    expect(classifyApnsResponse(200, undefined)).toBe("ok");
    expect(classifyApnsResponse(500, undefined)).toBe("retry");
  });
});

describe("JWT (WebCrypto)", () => {
  it("RS256 : signature vérifiable avec la clé publique, en-tête et claims corrects", async () => {
    const { pem, publicKey } = await rsaKeyPair();
    const jwt = await signJwt("RS256", pem, {}, { iss: "sa@x.iam", scope: "s" });
    const [h, c, s] = jwt.split(".");
    expect(decodePart(jwt, 0)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodePart(jwt, 1)).toEqual({ iss: "sa@x.iam", scope: "s" });
    const ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, publicKey, b64urlToBytes(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it("ES256 : signature r||s de 64 octets, kid dans l'en-tête, vérifiable", async () => {
    const { pem, publicKey } = await ecKeyPair();
    const jwt = await signJwt("ES256", pem, { kid: "KEY123" }, { iss: "TEAM", iat: 1 });
    const [h, c, s] = jwt.split(".");
    expect(decodePart(jwt, 0)).toEqual({ alg: "ES256", typ: "JWT", kid: "KEY123" });
    expect(b64urlToBytes(s).length).toBe(64);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, b64urlToBytes(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it("accepte une clé dont les retours à la ligne sont des \\n littéraux (secret mal collé)", async () => {
    const { pem } = await ecKeyPair();
    const jwt = await signJwt("ES256", pem.replace(/\n/g, "\\n"), {}, { iss: "T" });
    expect(jwt.split(".")).toHaveLength(3);
  });
});

describe("configuration depuis l'environnement", () => {
  it("parseFcmServiceAccount : valide, absente, invalide ; jamais d'exception", () => {
    const good = JSON.stringify({ project_id: "p", client_email: "a@b", private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n" });
    expect(parseFcmServiceAccount(good)).toEqual({ projectId: "p", clientEmail: "a@b", privateKey: expect.stringContaining("PRIVATE KEY") });
    expect(parseFcmServiceAccount(undefined)).toBeNull();
    expect(parseFcmServiceAccount("")).toBeNull();
    expect(parseFcmServiceAccount("{pas du json")).toBeNull();
    expect(parseFcmServiceAccount(JSON.stringify({ project_id: "p" }))).toBeNull();
    expect(parseFcmServiceAccount(JSON.stringify({ project_id: "p", client_email: "a", private_key: "secret" }))).toBeNull();
  });

  it("loadNativePushConfig : variable manquante => plateforme désactivée (null), pas d'exception", () => {
    expect(loadNativePushConfig(() => undefined)).toEqual({ fcm: null, apns: null });
    const cfg = loadNativePushConfig((k) => ({ APNS_KEY_P8: "p8", APNS_KEY_ID: "kid", APNS_TEAM_ID: "team" } as Record<string, string>)[k]);
    expect(cfg.fcm).toBeNull();
    expect(cfg.apns).toEqual({ keyP8: "p8", keyId: "kid", teamId: "team", bundleId: "ca.baobab.app", useSandbox: false });
    const partial = loadNativePushConfig((k) => ({ APNS_KEY_P8: "p8", APNS_KEY_ID: "kid" } as Record<string, string>)[k]);
    expect(partial.apns).toBeNull();
    const sandbox = loadNativePushConfig((k) => ({ APNS_KEY_P8: "p8", APNS_KEY_ID: "k", APNS_TEAM_ID: "t", APNS_BUNDLE_ID: "x.y", APNS_USE_SANDBOX: "TRUE" } as Record<string, string>)[k]);
    expect(sandbox.apns).toMatchObject({ bundleId: "x.y", useSandbox: true });
  });
});

describe("client d'envoi", () => {
  const N = { title: "Marie", body: "Salut", url: "/messages/" + UUID };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function fcmConfig() {
    const { pem } = await rsaKeyPair();
    return { projectId: "baobab-proj", clientEmail: "sa@baobab-proj.iam.gserviceaccount.com", privateKey: pem };
  }
  async function apnsConfig(over: Record<string, unknown> = {}) {
    const { pem } = await ecKeyPair();
    return { keyP8: pem, keyId: "KID", teamId: "TEAM", bundleId: "ca.baobab.app", useSandbox: false, ...over };
  }

  it("Android : obtient un jeton OAuth (mis en cache) puis POST /v1/projects/<id>/messages:send", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") return json(200, { access_token: "ya29.abc", expires_in: 3600 });
      return json(200, { name: "projects/x/messages/1" });
    });
    const client = createNativePushClient({ fcm: await fcmConfig(), apns: null }, { fetch: fetchMock as never, removeToken: vi.fn(), now: () => 1_000_000 });
    const res = await client.send([{ token: "A1", platform: "android" }, { token: "A2", platform: "android" }], N);
    expect(res).toEqual({ sent: 2, removed: 0, failed: 0, skipped: 0 });
    const oauth = calls.filter((c) => c.url.includes("oauth2"));
    expect(oauth).toHaveLength(1); // jeton d'accès mis en cache pour les 2 envois
    const body = new URLSearchParams(String(oauth[0].init.body));
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(decodePart(body.get("assertion")!, 1)).toMatchObject({
      iss: "sa@baobab-proj.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1000,
      exp: 4600,
    });
    const sends = calls.filter((c) => c.url.includes("fcm.googleapis.com"));
    expect(sends).toHaveLength(2);
    expect(sends[0].url).toBe("https://fcm.googleapis.com/v1/projects/baobab-proj/messages:send");
    expect((sends[0].init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.abc");
    expect(JSON.parse(String(sends[0].init.body)).message.data.url).toBe(N.url);
  });

  it("Android : UNREGISTERED => jeton supprimé ; erreur de charge utile => conservé", async () => {
    const removeToken = vi.fn(async () => {});
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return json(200, { access_token: "t", expires_in: 3600 });
      const token = JSON.parse(String(init.body)).message.token;
      if (token === "DEAD") return json(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } });
      if (token === "BADARG") return json(400, { error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "INVALID_ARGUMENT" }] } });
      return json(200, {});
    });
    const client = createNativePushClient({ fcm: await fcmConfig(), apns: null }, { fetch: fetchMock as never, removeToken });
    const res = await client.send([{ token: "DEAD", platform: "android" }, { token: "BADARG", platform: "android" }, { token: "OK", platform: "android" }], N);
    expect(res).toEqual({ sent: 1, removed: 1, failed: 1, skipped: 0 });
    expect(removeToken).toHaveBeenCalledTimes(1);
    expect(removeToken).toHaveBeenCalledWith("DEAD");
  });

  it("Android : 401 => un seul renouvellement du jeton d'accès, pas de boucle", async () => {
    let sendCalls = 0;
    let oauthCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("oauth2")) { oauthCalls++; return json(200, { access_token: `t${oauthCalls}`, expires_in: 3600 }); }
      sendCalls++;
      return sendCalls === 1 ? json(401, { error: { status: "UNAUTHENTICATED" } }) : json(200, {});
    });
    const client = createNativePushClient({ fcm: await fcmConfig(), apns: null }, { fetch: fetchMock as never, removeToken: vi.fn() });
    expect(await client.send([{ token: "A", platform: "android" }], N)).toMatchObject({ sent: 1 });
    expect(oauthCalls).toBe(2);
    const alwaysDenied = vi.fn(async (url: string) => (url.includes("oauth2") ? json(200, { access_token: "t", expires_in: 3600 }) : json(401, {})));
    const client2 = createNativePushClient({ fcm: await fcmConfig(), apns: null }, { fetch: alwaysDenied as never, removeToken: vi.fn() });
    expect(await client2.send([{ token: "A", platform: "android" }], N)).toMatchObject({ sent: 0, failed: 1 });
    expect(alwaysDenied).toHaveBeenCalledTimes(4); // oauth + envoi, puis oauth renouvelé + envoi : jamais plus
  });

  it("iOS : POST HTTP/2 api.push.apple.com avec jwt ES256, apns-topic et charge utile", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return json(200, {}); });
    const client = createNativePushClient({ fcm: null, apns: await apnsConfig() }, { fetch: fetchMock as never, removeToken: vi.fn(), now: () => 5_000_000 });
    const res = await client.send([{ token: "ab".repeat(32), platform: "ios" }], N);
    expect(res.sent).toBe(1);
    expect(calls[0].url).toBe(`https://api.push.apple.com/3/device/${"ab".repeat(32)}`);
    const h = calls[0].init.headers as Record<string, string>;
    expect(h["apns-topic"]).toBe("ca.baobab.app");
    expect(h["apns-push-type"]).toBe("alert");
    const jwt = h.authorization.replace(/^bearer /, "");
    expect(decodePart(jwt, 0)).toMatchObject({ alg: "ES256", kid: "KID" });
    expect(decodePart(jwt, 1)).toEqual({ iss: "TEAM", iat: 5000 });
    expect(JSON.parse(String(calls[0].init.body)).url).toBe(N.url);
  });

  it("iOS : sandbox demandé => api.sandbox.push.apple.com", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => { urls.push(url); return json(200, {}); });
    const client = createNativePushClient({ fcm: null, apns: await apnsConfig({ useSandbox: true }) }, { fetch: fetchMock as never, removeToken: vi.fn() });
    await client.send([{ token: "t".repeat(64), platform: "ios" }], N);
    expect(urls[0].startsWith("https://api.sandbox.push.apple.com/")).toBe(true);
  });

  it("iOS : BadDeviceToken sur la production mais accepté en sandbox => jeton conservé", async () => {
    const removeToken = vi.fn();
    const fetchMock = vi.fn(async (url: string) => (url.startsWith("https://api.push.apple.com") ? json(400, { reason: "BadDeviceToken" }) : json(200, {})));
    const client = createNativePushClient({ fcm: null, apns: await apnsConfig() }, { fetch: fetchMock as never, removeToken });
    expect(await client.send([{ token: "t".repeat(64), platform: "ios" }], N)).toMatchObject({ sent: 1, removed: 0 });
    expect(removeToken).not.toHaveBeenCalled();
  });

  it("iOS : BadDeviceToken partout / Unregistered => jeton supprimé", async () => {
    const removeToken = vi.fn(async () => {});
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      if (url.includes("/UNREG")) return json(410, { reason: "Unregistered" });
      return json(400, { reason: "BadDeviceToken" });
    });
    const client = createNativePushClient({ fcm: null, apns: await apnsConfig() }, { fetch: fetchMock as never, removeToken });
    const res = await client.send([{ token: "BAD".padEnd(64, "0"), platform: "ios" }, { token: "UNREG", platform: "ios" }], N);
    expect(res.removed).toBe(2);
    expect(removeToken).toHaveBeenCalledWith("BAD".padEnd(64, "0"));
    expect(removeToken).toHaveBeenCalledWith("UNREG");
  });

  it("plateforme non configurée => jetons ignorés, aucun appel réseau, aucune exception", async () => {
    const fetchMock = vi.fn();
    const client = createNativePushClient({ fcm: null, apns: null }, { fetch: fetchMock as never, removeToken: vi.fn() });
    expect(await client.send([{ token: "A", platform: "android" }, { token: "B", platform: "ios" }], N)).toEqual({ sent: 0, removed: 0, failed: 0, skipped: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("une panne réseau ou une clé illisible ne lève jamais et n'expose aucun secret dans le journal", async () => {
    const log = vi.fn();
    const badFcm = { projectId: "p", clientEmail: "a@b", privateKey: "-----BEGIN PRIVATE KEY-----\nSECRET-MATERIAL\n-----END PRIVATE KEY-----" };
    const client = createNativePushClient({ fcm: badFcm, apns: await apnsConfig() }, {
      fetch: (async () => { throw new Error("réseau coupé SECRET-MATERIAL"); }) as never,
      removeToken: vi.fn(),
      log,
    });
    const res = await client.send([{ token: "A", platform: "android" }, { token: "B".repeat(64), platform: "ios" }], N);
    expect(res).toEqual({ sent: 0, removed: 0, failed: 2, skipped: 0 });
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET-MATERIAL");
  });

  it("un échec de suppression du jeton n'interrompt pas les autres envois", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return json(200, { access_token: "t", expires_in: 3600 });
      return JSON.parse(String(init.body)).message.token === "DEAD" ? json(404, {}) : json(200, {});
    });
    const client = createNativePushClient({ fcm: await fcmConfig(), apns: null }, {
      fetch: fetchMock as never,
      removeToken: async () => { throw new Error("db down"); },
    });
    expect(await client.send([{ token: "DEAD", platform: "android" }, { token: "OK", platform: "android" }], N)).toMatchObject({ sent: 1, removed: 1 });
  });
});
