import { describe, it, expect, vi } from "vitest";

vi.mock("../supabaseClient", () => ({ supabase: {} }));
vi.mock("./platform", () => ({ isNative: () => true, getPlatform: () => "android" }));

import { isPushSupported, isIosNotInstalled, getPushSubscriptionStatus, enablePushNotifications, disablePushNotifications } from "./pushNotifications";

describe("pushNotifications en app native (étape 1 : désactivé proprement)", () => {
  it("n'est pas pris en charge, même si le WebView expose les API Web Push", () => {
    vi.stubGlobal("Notification", { permission: "default" });
    expect(isPushSupported()).toBe(false);
    expect(isIosNotInstalled()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("statut / désactivation sont des no-op sans erreur, activation refusée proprement", async () => {
    expect(await getPushSubscriptionStatus()).toEqual({ supported: false, permission: "unsupported", subscribed: false });
    await expect(disablePushNotifications()).resolves.toBeUndefined();
    await expect(enablePushNotifications()).rejects.toThrow(/pas prises en charge/);
  });
});
