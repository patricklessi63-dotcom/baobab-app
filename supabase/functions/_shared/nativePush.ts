// BAOBAB — Envoi de notifications push NATIVES (étape 3a de la mission mobile).
//
// Module PUR : aucun import Deno/npm, uniquement des API standard (fetch,
// crypto.subtle, atob/btoa, TextEncoder) disponibles dans Deno ET dans Node
// (Vitest : voir nativePush.test.ts). send-push/index.ts le charge et lui
// injecte `fetch`, l'horloge et la suppression d'un jeton invalide.
//
// Deux chemins d'envoi (justification complète dans MOBILE.md, « Étape 3a ») :
//  - Android : FCM, API HTTP v1 (OAuth2 par compte de service Google : JWT
//    RS256 -> jeton d'accès -> POST .../v1/projects/<id>/messages:send).
//    Message de type « notification » : affiché par le système même app fermée.
//  - iOS : APNs directement (JWT ES256 avec la clé .p8, HTTP/2). Le plugin
//    @capacitor/push-notifications v8 renvoie sur iOS un jeton APNs brut, pas un
//    jeton FCM : passer par FCM exigerait d'ajouter le SDK Firebase Messaging à
//    l'app iOS ; l'envoi APNs direct n'ajoute rien côté client.
//
// Garde-fous : rien ici ne lève d'exception vers l'appelant (send-push doit
// continuer d'envoyer le Web Push quoi qu'il arrive) ; aucun secret n'est
// journalisé ; une plateforme dont la configuration manque est ignorée.

export const ANDROID_CHANNEL_ID = "baobab_default";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const APNS_PRODUCTION_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
// Google recommande de ne pas redemander un jeton d'accès avant son expiration ;
// APNs exige un jeton de fournisseur rafraîchi au plus toutes les 20 min et
// valide au plus 60 min.
const APNS_JWT_TTL_MS = 40 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

export type NativePlatform = "android" | "ios";
export type NativeTokenRow = { token: string; platform: NativePlatform };
export type NativeNotification = { title: string; body: string; url: string };

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chemin de lien profond (`data.url`) d'une notification. Liste blanche alignée
 * sur src/lib/deepLinks.js : un type inconnu ou un identifiant qui n'est pas un
 * uuid retombe sur "/" (ouvre simplement l'app).
 */
export function deepLinkPathFor(kind: "message" | "match" | "like" | "follow", otherProfileId: unknown): string {
  if (typeof otherProfileId !== "string" || !UUID_RE.test(otherProfileId)) return "/";
  const id = otherProfileId.toLowerCase();
  if (kind === "message" || kind === "match") return `/messages/${id}`;
  if (kind === "like" || kind === "follow") return `/profile/${id}`;
  return "/";
}

/** Chemin relatif sûr : commence par un seul "/", pas de schéma, pas de contrôle, <= 200 car. */
export function sanitizeUrlPath(url: unknown): string {
  if (typeof url !== "string") return "/";
  if (url.length === 0 || url.length > 200) return "/";
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return "/";
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(url)) return "/";
  return url;
}

function clip(text: unknown, max: number): string {
  const s = typeof text === "string" ? text : "";
  return s.length > max ? s.slice(0, max) : s;
}

export function normalizeNotification(n: { title?: unknown; body?: unknown; url?: unknown }): NativeNotification {
  return { title: clip(n.title, 100) || "Baobab", body: clip(n.body, 240), url: sanitizeUrlPath(n.url) };
}

/** Même règle que le Web Push existant : seule une valeur `false` explicite désactive la catégorie. */
export function isCategoryEnabled(prefs: unknown, prefKey: string): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  return (prefs as Record<string, unknown>)[prefKey] !== false;
}

/** Corps de la requête FCM HTTP v1 (message « notification » + data pour le clic). */
export function buildFcmMessage(token: string, n: NativeNotification) {
  return {
    message: {
      token,
      notification: { title: n.title, body: n.body },
      // FCM n'accepte que des chaînes dans `data`.
      data: { url: n.url },
      android: {
        priority: "HIGH",
        notification: { channel_id: ANDROID_CHANNEL_ID },
      },
    },
  };
}

/** Corps de la requête APNs (alerte visible ; `url` à la racine = userInfo côté plugin). */
export function buildApnsBody(n: NativeNotification) {
  return { aps: { alert: { title: n.title, body: n.body }, sound: "default" }, url: n.url };
}

// ---------------------------------------------------------------------------
// Classification des réponses
// ---------------------------------------------------------------------------

export type SendOutcome = "ok" | "invalid_token" | "bad_device_token" | "auth" | "retry" | "error";

function fcmErrorCodes(body: any): string[] {
  const codes: string[] = [];
  const details = body?.error?.details;
  if (Array.isArray(details)) for (const d of details) if (typeof d?.errorCode === "string") codes.push(d.errorCode);
  if (typeof body?.error?.status === "string") codes.push(body.error.status);
  return codes;
}

/**
 * - 2xx : ok.
 * - UNREGISTERED / NOT_FOUND / HTTP 404 : le jeton n'existe plus (appli
 *   désinstallée, jeton renouvelé) -> `invalid_token` (le jeton est supprimé).
 * - INVALID_ARGUMENT et SENDER_ID_MISMATCH : volontairement PAS supprimés
 *   (INVALID_ARGUMENT peut venir de notre charge utile, SENDER_ID_MISMATCH d'un
 *   mauvais projet Firebase : supprimer effacerait des jetons valides).
 * - 401/403 : identifiants de service invalides ou expirés -> `auth`.
 * - 429/5xx : `retry`.
 */
export function classifyFcmResponse(status: number, body: any): SendOutcome {
  if (status >= 200 && status < 300) return "ok";
  const codes = fcmErrorCodes(body);
  if (codes.includes("UNREGISTERED") || codes.includes("NOT_FOUND") || status === 404) return "invalid_token";
  if (status === 401 || status === 403 || codes.includes("UNAUTHENTICATED")) return "auth";
  if (status === 429 || status >= 500) return "retry";
  return "error";
}

/**
 * - 200 : ok.
 * - 410 / Unregistered : jeton périmé -> `invalid_token`.
 * - 400 BadDeviceToken : jeton invalide OU émis pour l'autre environnement
 *   (sandbox/production) -> `bad_device_token` : l'orchestrateur retente sur
 *   l'autre hôte avant de supprimer.
 * - DeviceTokenNotForTopic : mauvais bundle id configuré -> `error` (pas de
 *   suppression : ce serait effacer des jetons valides à cause d'une config).
 * - 403 ExpiredProviderToken/InvalidProviderToken : `auth`.
 */
export function classifyApnsResponse(status: number, reason: string | undefined): SendOutcome {
  if (status === 200) return "ok";
  if (status === 410 || reason === "Unregistered") return "invalid_token";
  if (reason === "BadDeviceToken") return "bad_device_token";
  if (status === 403 || reason === "ExpiredProviderToken" || reason === "InvalidProviderToken") return "auth";
  if (status === 429 || status >= 500) return "retry";
  return "error";
}

// ---------------------------------------------------------------------------
// JWT (WebCrypto)
// ---------------------------------------------------------------------------

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlFromString(text: string): string {
  return b64urlFromBytes(new TextEncoder().encode(text));
}

function pemToDer(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signJwt(
  alg: "RS256" | "ES256",
  privateKeyPem: string,
  header: Record<string, unknown>,
  claims: Record<string, unknown>
): Promise<string> {
  const signingInput = `${b64urlFromString(JSON.stringify({ alg, typ: "JWT", ...header }))}.${b64urlFromString(JSON.stringify(claims))}`;
  const der = pemToDer(privateKeyPem);
  const keyAlg = alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" };
  const signAlg = alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("pkcs8", der, keyAlg, false, ["sign"]);
  // ECDSA via WebCrypto renvoie déjà r||s (64 octets, IEEE P1363) = format JWS.
  const signature = new Uint8Array(await crypto.subtle.sign(signAlg, key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${b64urlFromBytes(signature)}`;
}

// ---------------------------------------------------------------------------
// Configuration (depuis les variables d'environnement)
// ---------------------------------------------------------------------------

export type FcmServiceAccount = { projectId: string; clientEmail: string; privateKey: string };
export type ApnsConfig = { keyP8: string; keyId: string; teamId: string; bundleId: string; useSandbox: boolean };
export type NativePushConfig = { fcm: FcmServiceAccount | null; apns: ApnsConfig | null };

/** Analyse FCM_SERVICE_ACCOUNT_JSON ; `null` si absent ou invalide (jamais d'exception, jamais de contenu journalisé). */
export function parseFcmServiceAccount(raw: string | undefined | null): FcmServiceAccount | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const j = JSON.parse(raw);
    if (typeof j?.project_id !== "string" || typeof j?.client_email !== "string" || typeof j?.private_key !== "string") return null;
    if (!j.project_id || !j.client_email || !j.private_key.includes("PRIVATE KEY")) return null;
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
  } catch {
    return null;
  }
}

export function loadNativePushConfig(get: (name: string) => string | undefined): NativePushConfig {
  const fcm = parseFcmServiceAccount(get("FCM_SERVICE_ACCOUNT_JSON"));
  const keyP8 = get("APNS_KEY_P8");
  const keyId = get("APNS_KEY_ID");
  const teamId = get("APNS_TEAM_ID");
  const apns: ApnsConfig | null =
    keyP8 && keyId && teamId
      ? {
          keyP8,
          keyId,
          teamId,
          bundleId: get("APNS_BUNDLE_ID") || "ca.baobab.app",
          useSandbox: (get("APNS_USE_SANDBOX") || "").toLowerCase() === "true",
        }
      : null;
  return { fcm, apns };
}

// ---------------------------------------------------------------------------
// Client d'envoi
// ---------------------------------------------------------------------------

export type NativePushDeps = {
  fetch: typeof fetch;
  now?: () => number;
  /** Supprime un jeton devenu invalide (UNREGISTERED, BadDeviceToken confirmé…). */
  removeToken: (token: string) => Promise<void>;
  /** Journal sans donnée sensible (jamais de jeton complet ni de clé). */
  log?: (message: string) => void;
};

export type NativePushResult = { sent: number; removed: number; failed: number; skipped: number };

export function createNativePushClient(config: NativePushConfig, deps: NativePushDeps) {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  let fcmAccess: { token: string; expiresAt: number } | null = null;
  let apnsJwt: { token: string; expiresAt: number } | null = null;

  // Demande en cours : les envois d'un même lot partent en parallèle, ils
  // doivent partager UNE seule demande de jeton d'accès.
  let fcmAccessInFlight: Promise<string> | null = null;

  function getFcmAccessToken(force = false): Promise<string> {
    if (!force && fcmAccess && fcmAccess.expiresAt - EXPIRY_MARGIN_MS > now()) return Promise.resolve(fcmAccess.token);
    if (!fcmAccessInFlight) {
      fcmAccessInFlight = requestFcmAccessToken().finally(() => { fcmAccessInFlight = null; });
    }
    return fcmAccessInFlight;
  }

  async function requestFcmAccessToken(): Promise<string> {
    const sa = config.fcm!;
    const iat = Math.floor(now() / 1000);
    const assertion = await signJwt("RS256", sa.privateKey, {}, {
      iss: sa.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat,
      exp: iat + 3600,
    });
    const res = await deps.fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || typeof json?.access_token !== "string") throw new Error(`FCM oauth ${res.status}`);
    const ttl = typeof json.expires_in === "number" ? json.expires_in : 3600;
    fcmAccess = { token: json.access_token, expiresAt: now() + ttl * 1000 };
    return fcmAccess.token;
  }

  async function getApnsJwt(force = false): Promise<string> {
    const a = config.apns!;
    if (!force && apnsJwt && apnsJwt.expiresAt > now()) return apnsJwt.token;
    const token = await signJwt("ES256", a.keyP8, { kid: a.keyId }, { iss: a.teamId, iat: Math.floor(now() / 1000) });
    apnsJwt = { token, expiresAt: now() + APNS_JWT_TTL_MS };
    return token;
  }

  async function postFcm(token: string, n: NativeNotification, accessToken: string) {
    const res = await deps.fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.fcm!.projectId)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildFcmMessage(token, n)),
    });
    const body = res.ok ? null : await res.json().catch(() => null);
    return classifyFcmResponse(res.status, body);
  }

  async function sendFcm(token: string, n: NativeNotification): Promise<SendOutcome> {
    let outcome = await postFcm(token, n, await getFcmAccessToken());
    if (outcome === "auth") {
      // Jeton d'accès refusé : un seul renouvellement, jamais de boucle.
      outcome = await postFcm(token, n, await getFcmAccessToken(true));
    }
    return outcome;
  }

  async function postApns(host: string, token: string, n: NativeNotification, jwt: string) {
    const a = config.apns!;
    const res = await deps.fetch(`${host}/3/device/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": a.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(buildApnsBody(n)),
    });
    let reason: string | undefined;
    if (!res.ok) reason = (await res.json().catch(() => null))?.reason;
    return classifyApnsResponse(res.status, reason);
  }

  async function sendApns(token: string, n: NativeNotification): Promise<SendOutcome> {
    const a = config.apns!;
    const primary = a.useSandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
    const other = a.useSandbox ? APNS_PRODUCTION_HOST : APNS_SANDBOX_HOST;
    let jwt = await getApnsJwt();
    let outcome = await postApns(primary, token, n, jwt);
    if (outcome === "auth") {
      jwt = await getApnsJwt(true);
      outcome = await postApns(primary, token, n, jwt);
    }
    if (outcome === "bad_device_token") {
      // Un jeton de développement envoyé à la production (ou l'inverse) donne
      // aussi BadDeviceToken : on essaie l'autre environnement avant de conclure.
      outcome = await postApns(other, token, n, jwt);
      if (outcome === "bad_device_token") return "invalid_token";
    }
    return outcome;
  }

  async function send(rows: NativeTokenRow[], notification: NativeNotification): Promise<NativePushResult> {
    const result: NativePushResult = { sent: 0, removed: 0, failed: 0, skipped: 0 };
    const n = normalizeNotification(notification);
    await Promise.allSettled(
      rows.map(async (row) => {
        try {
          let outcome: SendOutcome;
          if (row.platform === "android" && config.fcm) outcome = await sendFcm(row.token, n);
          else if (row.platform === "ios" && config.apns) outcome = await sendApns(row.token, n);
          else {
            result.skipped++;
            return;
          }
          if (outcome === "ok") result.sent++;
          else if (outcome === "invalid_token") {
            result.removed++;
            try {
              await deps.removeToken(row.token);
            } catch {
              log(`native push: suppression du jeton ${row.platform} impossible`);
            }
          } else {
            result.failed++;
            log(`native push: échec ${row.platform} (${outcome})`);
          }
        } catch {
          // Message volontairement sans détail : l'erreur peut contenir des éléments d'identifiants.
          result.failed++;
          log(`native push: erreur d'envoi ${row.platform}`);
        }
      })
    );
    return result;
  }

  return { send };
}
