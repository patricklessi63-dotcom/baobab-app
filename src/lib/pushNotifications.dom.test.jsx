import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Bug corrigé à l'audit des notifications push (voir pushNotifications.js) :
// getPushSubscriptionStatus() affichait "activé" dès qu'un abonnement
// PushManager existait localement, sans jamais vérifier que la ligne
// push_subscriptions correspondante existe réellement côté serveur. Si
// l'upsert de enablePushNotifications() a échoué après coup (réseau coupé
// juste après l'abonnement navigateur), l'utilisateur voyait "Désactiver"
// (donc croyait les push actives) alors qu'aucune notification ne pouvait
// jamais lui être envoyée (send-push ne trouve aucune ligne pour lui).

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  selectChain: {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  },
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: { getUser: mocks.getUserMock },
    from: mocks.fromMock,
  },
}));

import { getPushSubscriptionStatus } from "./pushNotifications";

function makeSubscription(endpoint = "https://push.example/abc") {
  return {
    endpoint,
    toJSON: () => ({ keys: { p256dh: "p256dh-key", auth: "auth-key" } }),
  };
}

function setupBrowserEnv({ permission = "granted", subscription = makeSubscription() } = {}) {
  global.window.PushManager = function PushManager() {};
  global.Notification = { permission };
  global.navigator.serviceWorker = {
    getRegistration: vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
    }),
  };
}

describe("getPushSubscriptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.selectChain.maybeSingle,
        }),
      }),
      upsert: mocks.upsertMock,
    }));
  });

  afterEach(() => {
    delete global.window.PushManager;
    delete global.Notification;
    delete global.navigator.serviceWorker;
  });

  it("rapporte 'non abonné' si la permission n'est pas accordée, sans toucher au réseau", async () => {
    setupBrowserEnv({ permission: "denied" });
    const status = await getPushSubscriptionStatus();
    expect(status).toEqual({ supported: true, permission: "denied", subscribed: false });
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });

  it("rapporte 'abonné' quand la ligne push_subscriptions existe déjà pour cet endpoint", async () => {
    setupBrowserEnv();
    mocks.selectChain.maybeSingle.mockResolvedValue({ data: { id: "row-1" }, error: null });

    const status = await getPushSubscriptionStatus();

    expect(status).toEqual({ supported: true, permission: "granted", subscribed: true });
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("répare silencieusement une ligne manquante (upsert réussi) et rapporte quand même 'abonné'", async () => {
    setupBrowserEnv();
    mocks.selectChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.upsertMock.mockResolvedValue({ error: null });

    const status = await getPushSubscriptionStatus();

    expect(status).toEqual({ supported: true, permission: "granted", subscribed: true });
    expect(mocks.upsertMock).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        endpoint: "https://push.example/abc",
        p256dh: "p256dh-key",
        auth: "auth-key",
      },
      { onConflict: "endpoint" }
    );
  });

  it("ne ment plus à l'utilisateur : rapporte 'non abonné' si la ligne manque et que la réparation échoue aussi", async () => {
    setupBrowserEnv();
    mocks.selectChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.upsertMock.mockResolvedValue({ error: new Error("network down") });

    const status = await getPushSubscriptionStatus();

    expect(status).toEqual({ supported: true, permission: "granted", subscribed: false });
  });
});
