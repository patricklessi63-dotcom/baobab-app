import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Notifications push NATIVES (étape 3a) : plugin @capacitor/push-notifications
// entièrement simulé. Aucune requête réelle, aucun appareil.

const plat = vi.hoisted(() => ({ native: true, platform: "android" }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => (plat.native ? plat.platform : "web") }));

const push = vi.hoisted(() => ({
  handlers: {},
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  createChannel: vi.fn(),
  addListener: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: push }));

const db = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  upsert: vi.fn(),
  deleteEq: vi.fn(),
  from: vi.fn(),
}));
vi.mock("../supabaseClient", () => ({
  supabase: { auth: { getUser: db.getUser }, rpc: db.rpc, from: db.from },
}));

import {
  enableNativePush, disableNativePush, syncNativePushRegistration, getNativePushStatus,
  listenNotificationTaps, saveDeviceToken, getStoredToken, ANDROID_CHANNEL, NATIVE_PUSH_MESSAGES, _resetNativePushState,
} from "./nativePush";

const TOKEN = "fcm-token-AAAAAAAAAAAAAAAAAAAAAAAA";

/** Après register(), le « système » renvoie un jeton via l'évènement `registration`. */
function systemReturnsToken(token = TOKEN) {
  push.register.mockImplementation(async () => {
    queueMicrotask(() => push.handlers.registration?.({ value: token }));
  });
}

beforeEach(() => {
  plat.native = true;
  plat.platform = "android";
  localStorage.clear();
  _resetNativePushState();
  push.handlers = {};
  Object.values(push).forEach((f) => { if (typeof f?.mockReset === "function") f.mockReset(); });
  push.checkPermissions.mockResolvedValue({ receive: "prompt" });
  push.requestPermissions.mockResolvedValue({ receive: "granted" });
  push.unregister.mockResolvedValue(undefined);
  push.createChannel.mockResolvedValue(undefined);
  push.addListener.mockImplementation(async (name, fn) => { push.handlers[name] = fn; return { remove: push.remove }; });
  systemReturnsToken();
  db.getUser.mockReset().mockResolvedValue({ data: { user: { id: "user-A" } } });
  db.rpc.mockReset().mockResolvedValue({ error: null });
  db.upsert.mockReset().mockResolvedValue({ error: null });
  db.deleteEq.mockReset().mockResolvedValue({ error: null });
  db.from.mockReset().mockImplementation(() => ({ upsert: db.upsert, delete: () => ({ eq: db.deleteEq }) }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("enableNativePush — enregistrement", () => {
  it("demande la permission, crée le canal Android, s'enregistre et stocke le jeton du compte (platform android)", async () => {
    await enableNativePush();
    expect(push.requestPermissions).toHaveBeenCalledTimes(1);
    expect(push.createChannel).toHaveBeenCalledWith(ANDROID_CHANNEL);
    expect(ANDROID_CHANNEL.id).toBe("baobab_default");
    expect(push.register).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("register_device_push_token", {
      p_token: TOKEN, p_platform: "android", p_app_version: expect.anything(),
    });
    expect(getStoredToken()).toBe(TOKEN);
    expect(localStorage.getItem("bb-native-push-optin:user-A")).toBe("1");
  });

  it("iOS : pas de canal Android, platform ios", async () => {
    plat.platform = "ios";
    await enableNativePush();
    expect(push.createChannel).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith("register_device_push_token", expect.objectContaining({ p_platform: "ios" }));
  });

  it("permission déjà accordée : ne redemande pas", async () => {
    push.checkPermissions.mockResolvedValue({ receive: "granted" });
    await enableNativePush();
    expect(push.requestPermissions).not.toHaveBeenCalled();
    expect(push.register).toHaveBeenCalled();
  });

  it("refus : message honnête (réglages du téléphone), aucun enregistrement, aucun jeton", async () => {
    push.requestPermissions.mockResolvedValue({ receive: "denied" });
    await expect(enableNativePush()).rejects.toThrow(NATIVE_PUSH_MESSAGES.blocked);
    expect(NATIVE_PUSH_MESSAGES.blocked).toMatch(/réglages de ton téléphone/);
    expect(push.register).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(getStoredToken()).toBeNull();
  });

  it("demande fermée sans réponse : ce n'est pas annoncé comme un refus", async () => {
    push.requestPermissions.mockResolvedValue({ receive: "prompt" });
    await expect(enableNativePush()).rejects.toThrow(NATIVE_PUSH_MESSAGES.dismissed);
    expect(push.register).not.toHaveBeenCalled();
  });

  it("registrationError (ex. Firebase non configuré) : message clair, rien en base", async () => {
    push.register.mockImplementation(async () => { queueMicrotask(() => push.handlers.registrationError?.({ error: "FirebaseApp not initialized" })); });
    await expect(enableNativePush()).rejects.toThrow(NATIVE_PUSH_MESSAGES.unavailable);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("register() qui lève (google-services.json absent) : même message, pas d'exception brute", async () => {
    push.register.mockRejectedValue(new Error("Default FirebaseApp is not initialized"));
    await expect(enableNativePush()).rejects.toThrow(NATIVE_PUSH_MESSAGES.unavailable);
  });
});

describe("stockage du jeton — jamais bloquant", () => {
  it("table absente (SQL non exécuté) : l'activation RÉUSSIT, l'échec est seulement journalisé", async () => {
    db.rpc.mockResolvedValue({ error: { code: "PGRST202", message: "Could not find the function public.register_device_push_token" } });
    db.upsert.mockResolvedValue({ error: { code: "42P01", message: 'relation "device_push_tokens" does not exist' } });
    await expect(enableNativePush()).resolves.toEqual({ token: TOKEN });
    expect(console.warn).toHaveBeenCalled();
    expect(getStoredToken()).toBe(TOKEN);
  });

  it("fonction RPC absente mais table présente : upsert direct PAR JETON (pas de doublon)", async () => {
    db.rpc.mockResolvedValue({ error: { code: "PGRST202", message: "x" } });
    await enableNativePush();
    expect(db.from).toHaveBeenCalledWith("device_push_tokens");
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-A", token: TOKEN, platform: "android" }), { onConflict: "token" });
  });

  it("une exception réseau ne se propage pas", async () => {
    db.rpc.mockRejectedValue(new Error("réseau"));
    await expect(saveDeviceToken(TOKEN, "user-A")).resolves.toBe(false);
  });

  it("un jeton qui change de compte sur le même appareil est réassigné via la fonction (même jeton, nouvel utilisateur)", async () => {
    await enableNativePush();
    db.getUser.mockResolvedValue({ data: { user: { id: "user-B" } } });
    await enableNativePush();
    const calls = db.rpc.mock.calls.filter((c) => c[0] === "register_device_push_token");
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_token).toBe(calls[1][1].p_token); // la réassignation est faite côté SQL (unique(token))
    expect(localStorage.getItem("bb-native-push-optin:user-B")).toBe("1");
  });
});

describe("disableNativePush — désinscription", () => {
  async function enabled() { await enableNativePush(); db.rpc.mockClear(); db.from.mockClear(); }

  it("supprime le jeton de CET appareil seulement, invalide le jeton système, efface le choix", async () => {
    await enabled();
    await disableNativePush();
    expect(db.from).toHaveBeenCalledWith("device_push_tokens");
    expect(db.deleteEq).toHaveBeenCalledWith("token", TOKEN);
    expect(push.unregister).toHaveBeenCalledTimes(1);
    expect(getStoredToken()).toBeNull();
    expect(localStorage.getItem("bb-native-push-optin:user-A")).toBeNull();
  });

  it("à la déconnexion : jeton supprimé AVANT, mais le choix de l'utilisateur est conservé", async () => {
    await enabled();
    await disableNativePush({ signOut: true });
    expect(db.deleteEq).toHaveBeenCalledWith("token", TOKEN);
    expect(getStoredToken()).toBeNull();
    expect(localStorage.getItem("bb-native-push-optin:user-A")).toBe("1");
  });

  it("ne lève jamais : suppression en base en échec, table absente, plugin qui lève", async () => {
    await enabled();
    db.deleteEq.mockResolvedValue({ error: { code: "42P01", message: "no table" } });
    push.unregister.mockRejectedValue(new Error("boom"));
    await expect(disableNativePush({ signOut: true })).resolves.toBeUndefined();
    db.deleteEq.mockRejectedValue(new Error("réseau"));
    await expect(disableNativePush({ signOut: true })).resolves.toBeUndefined();
  });

  it("sans jeton connu : aucun appel en base", async () => {
    await disableNativePush();
    expect(db.deleteEq).not.toHaveBeenCalled();
  });
});

describe("syncNativePushRegistration — reconnexion", () => {
  it("compte qui a activé + permission déjà accordée : se ré-enregistre en silence, sans JAMAIS redemander la permission", async () => {
    localStorage.setItem("bb-native-push-optin:user-A", "1");
    push.checkPermissions.mockResolvedValue({ receive: "granted" });
    expect(await syncNativePushRegistration("user-A")).toBe(true);
    expect(push.requestPermissions).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith("register_device_push_token", expect.objectContaining({ p_token: TOKEN }));
  });

  it("compte qui n'a jamais activé : rien (pas de demande au premier lancement)", async () => {
    push.checkPermissions.mockResolvedValue({ receive: "granted" });
    expect(await syncNativePushRegistration("user-A")).toBe(false);
    expect(push.register).not.toHaveBeenCalled();
    expect(push.requestPermissions).not.toHaveBeenCalled();
  });

  it("permission retirée dans les réglages du téléphone : rien", async () => {
    localStorage.setItem("bb-native-push-optin:user-A", "1");
    push.checkPermissions.mockResolvedValue({ receive: "denied" });
    expect(await syncNativePushRegistration("user-A")).toBe(false);
    expect(push.register).not.toHaveBeenCalled();
  });

  it("un jeton renouvelé par le système (registration spontané) est ré-enregistré pour le compte qui a activé", async () => {
    localStorage.setItem("bb-native-push-optin:user-A", "1");
    push.checkPermissions.mockResolvedValue({ receive: "granted" });
    await syncNativePushRegistration("user-A");
    db.rpc.mockClear();
    push.handlers.registration({ value: "nouveau-jeton-BBBBBBBBBBBBBBBBBBBBBBB" });
    await vi.waitFor(() => expect(db.rpc).toHaveBeenCalledWith("register_device_push_token", expect.objectContaining({ p_token: "nouveau-jeton-BBBBBBBBBBBBBBBBBBBBBBB" })));
    expect(getStoredToken()).toBe("nouveau-jeton-BBBBBBBBBBBBBBBBBBBBBBB");
  });
});

describe("getNativePushStatus", () => {
  it("accordée + jeton : activé ; refusée : non, permission denied", async () => {
    push.checkPermissions.mockResolvedValue({ receive: "granted" });
    localStorage.setItem("bb-native-push-token", TOKEN);
    expect(await getNativePushStatus()).toMatchObject({ supported: true, permission: "granted", subscribed: true });
    push.checkPermissions.mockResolvedValue({ receive: "denied" });
    expect(await getNativePushStatus()).toMatchObject({ supported: true, permission: "denied", subscribed: false });
  });

  it("jamais demandée : permission default, non abonné", async () => {
    expect(await getNativePushStatus()).toMatchObject({ permission: "default", subscribed: false });
  });
});

describe("clic sur une notification", () => {
  it("transmet data.url ; ignore une notification sans url", async () => {
    const cb = vi.fn();
    const stop = await listenNotificationTaps(cb);
    push.handlers.pushNotificationActionPerformed({ notification: { data: { url: "/messages/abc" } } });
    push.handlers.pushNotificationActionPerformed({ notification: { data: {} } });
    push.handlers.pushNotificationActionPerformed({});
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("/messages/abc");
    stop();
    expect(push.remove).toHaveBeenCalled();
  });
});

describe("web : rien ne s'exécute", () => {
  it("aucune fonction ne touche au plugin, au réseau ni au stockage", async () => {
    plat.native = false;
    await expect(enableNativePush()).rejects.toThrow(/pas prises en charge/);
    await disableNativePush();
    expect(await syncNativePushRegistration("user-A")).toBe(false);
    expect(await getNativePushStatus()).toEqual({ supported: false, permission: "unsupported", subscribed: false });
    const stop = await listenNotificationTaps(() => {});
    stop();
    expect(push.addListener).not.toHaveBeenCalled();
    expect(push.checkPermissions).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });
});
