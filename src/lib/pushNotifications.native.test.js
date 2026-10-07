import { describe, it, expect, vi, beforeEach } from "vitest";

// App native (étape 3a) : pushNotifications.js aiguille vers nativePush.js
// (FCM/APNs) — plus de Web Push ni de service worker dans la WebView.

vi.mock("../supabaseClient", () => ({ supabase: {} }));
vi.mock("./platform", () => ({ isNative: () => true, getPlatform: () => "android" }));

const native = vi.hoisted(() => ({
  getNativePushStatus: vi.fn(async () => ({ supported: true, permission: "granted", subscribed: true, native: true })),
  enableNativePush: vi.fn(async () => ({ token: "t" })),
  disableNativePush: vi.fn(async () => undefined),
}));
vi.mock("./nativePush", () => native);

import { isPushSupported, isIosNotInstalled, getPushSubscriptionStatus, enablePushNotifications, disablePushNotifications } from "./pushNotifications";

beforeEach(() => { Object.values(native).forEach((f) => f.mockClear()); });

describe("pushNotifications en app native", () => {
  it("est pris en charge (notifications natives), sans astuce d'installation iOS", () => {
    expect(isPushSupported()).toBe(true);
    expect(isIosNotInstalled()).toBe(false);
  });

  it("statut / activation / désactivation passent par le chemin natif", async () => {
    expect(await getPushSubscriptionStatus()).toMatchObject({ supported: true, subscribed: true });
    await enablePushNotifications();
    expect(native.enableNativePush).toHaveBeenCalledTimes(1);
    await disablePushNotifications();
    expect(native.disableNativePush).toHaveBeenCalledWith({ signOut: false });
  });

  it("à la déconnexion, le choix de l'utilisateur est conservé (signOut: true)", async () => {
    await disablePushNotifications({ signOut: true });
    expect(native.disableNativePush).toHaveBeenCalledWith({ signOut: true });
  });

  it("aucun service worker n'est enregistré dans la WebView", async () => {
    const register = vi.fn();
    vi.stubGlobal("navigator", { ...globalThis.navigator, serviceWorker: { register } });
    await enablePushNotifications();
    expect(register).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
