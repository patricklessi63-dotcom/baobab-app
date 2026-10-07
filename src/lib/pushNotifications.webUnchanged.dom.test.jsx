import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Étape 3a : le chemin WEB de pushNotifications.js doit rester identique — Web
// Push (VAPID) + table push_subscriptions, jamais le plugin natif ni la table
// device_push_tokens.

vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U");

vi.mock("./platform", () => ({ isNative: () => false, getPlatform: () => "web" }));

const plugin = vi.hoisted(() => ({ touched: vi.fn() }));
vi.mock("@capacitor/push-notifications", () => ({
  get PushNotifications() { plugin.touched(); return {}; },
}));

const db = vi.hoisted(() => ({ upsert: vi.fn(), deleteEq: vi.fn(), from: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("../supabaseClient", () => ({ supabase: { auth: { getUser: db.getUser }, from: db.from, rpc: db.rpc } }));

import { isPushSupported, enablePushNotifications, disablePushNotifications, getPushSubscriptionStatus } from "./pushNotifications";

const subscription = {
  endpoint: "https://push.example/abc",
  toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.window.PushManager = function PushManager() {};
  global.Notification = { permission: "default", requestPermission: vi.fn(async () => "granted") };
  const registration = { pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) } };
  global.navigator.serviceWorker = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    getRegistration: vi.fn(async () => ({ pushManager: { getSubscription: vi.fn(async () => subscription) } })),
  };
  db.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  db.upsert.mockResolvedValue({ error: null });
  db.deleteEq.mockResolvedValue({ error: null });
  db.from.mockImplementation(() => ({ upsert: db.upsert, delete: () => ({ eq: db.deleteEq }) }));
});
afterEach(() => { delete global.window.PushManager; delete global.Notification; delete global.navigator.serviceWorker; });

describe("pushNotifications — web inchangé", () => {
  it("activation : service worker /sw.js + upsert push_subscriptions par endpoint, rien de natif", async () => {
    expect(isPushSupported()).toBe(true);
    await enablePushNotifications();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    expect(db.from).toHaveBeenCalledWith("push_subscriptions");
    expect(db.upsert).toHaveBeenCalledWith({ user_id: "u1", endpoint: subscription.endpoint, p256dh: "p", auth: "a" }, { onConflict: "endpoint" });
    expect(db.from).not.toHaveBeenCalledWith("device_push_tokens");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("désactivation (même avec { signOut: true } venu de la déconnexion) : supprime l'abonnement navigateur", async () => {
    await disablePushNotifications({ signOut: true });
    expect(db.from).toHaveBeenCalledWith("push_subscriptions");
    expect(db.deleteEq).toHaveBeenCalledWith("endpoint", subscription.endpoint);
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalledWith("device_push_tokens");
  });

  it("refus du navigateur : mêmes messages qu'avant", async () => {
    global.Notification.requestPermission = vi.fn(async () => "denied");
    await expect(enablePushNotifications()).rejects.toThrow("Notifications bloquées. Tu peux les autoriser dans les réglages de ton navigateur.");
  });

  it("statut : permission refusée => non abonné ; le plugin natif n'est jamais sollicité", async () => {
    global.Notification.permission = "denied";
    expect(await getPushSubscriptionStatus()).toEqual({ supported: true, permission: "denied", subscribed: false });
    expect(plugin.touched).not.toHaveBeenCalled();
  });
});
