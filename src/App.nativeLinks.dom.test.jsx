import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Liens profonds de l'app native (étape 3a), testés sur le VRAI App.jsx avec les
// plugins Capacitor simulés : clic sur une notification, App Links, lien de
// réinitialisation de mot de passe ouvert dans l'app.

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const ORIGIN = "https://baobab-app-zeta.vercel.app";

const mocks = vi.hoisted(() => ({
  native: true,
  shell: { props: null },
  urlHandlers: [],
  tapHandlers: [],
  launchUrl: null,
  setSession: vi.fn(),
  signOut: vi.fn(() => { mocks.order.push("signOut"); return Promise.resolve({ error: null }); }),
  syncPush: vi.fn(async () => false),
  disablePush: vi.fn(async () => {}),
  order: [],
  authCb: null,
}));

vi.mock("./lib/platform", () => ({ isNative: () => mocks.native, getPlatform: () => (mocks.native ? "android" : "web") }));
vi.mock("./lib/nativeApp", () => ({
  onAppStateChange: async () => () => {},
  onAppUrlOpen: async (cb) => { mocks.urlHandlers.push(cb); return () => {}; },
  getLaunchUrl: async () => mocks.launchUrl,
  onBackButton: async () => () => {},
  minimizeApp: async () => {},
}));
vi.mock("./lib/nativePush", () => ({
  listenNotificationTaps: async (cb) => { mocks.tapHandlers.push(cb); return () => {}; },
  syncNativePushRegistration: (...a) => mocks.syncPush(...a),
  getNativePushStatus: async () => ({ supported: false, permission: "unsupported", subscribed: false }),
  enableNativePush: async () => ({}),
  disableNativePush: (...a) => { mocks.order.push("disablePush"); return mocks.disablePush(...a); },
}));
vi.mock("./components/SocialShell", () => ({
  default: (props) => {
    mocks.shell.props = props;
    return <div data-testid="shell" data-deeplink={props.deepLink ? `${props.deepLink.kind}:${props.deepLink.id}` : ""} />;
  },
}));

vi.mock("./supabaseClient", () => {
  const ME_AUTH = "auth-me";
  const makeBuilder = (table) => {
    const ctx = { table };
    const b = {};
    ["select", "neq", "lt", "lte", "order", "range", "limit", "is", "ilike", "or", "match", "contains", "not", "update", "delete", "upsert", "insert", "eq", "gt", "gte", "in"].forEach((m) => { b[m] = vi.fn(() => b); });
    const run = (single) => Promise.resolve(
      table === "profiles" && single
        ? { data: { id: "profile-me", user_id: ME_AUTH, name: "Moi", onboarding_completed_at: "2026-01-01T00:00:00Z" }, error: null }
        : { data: single ? null : [], error: null }
    );
    b.single = vi.fn(() => run(true));
    b.maybeSingle = vi.fn(() => run(true));
    b.then = (resolve, reject) => run(false).then(resolve, reject);
    return b;
  };
  const supabase = {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: ME_AUTH } } })),
      onAuthStateChange: vi.fn((cb) => {
        mocks.authCb = cb;
        setTimeout(() => cb("INITIAL_SESSION", { user: { id: ME_AUTH, email: "me@x.test" } }), 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      setSession: (...a) => mocks.setSession(...a),
      signOut: (...a) => mocks.signOut(...a),
    },
    from: vi.fn((table) => makeBuilder(table)),
    rpc: vi.fn(() => Promise.resolve({ data: { likers: [], admirers_count: 0 }, error: null })),
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); ch.send = vi.fn(); return ch; }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  };
  return { supabase };
});

import App from "./App";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = true;
  mocks.shell.props = null;
  mocks.urlHandlers.length = 0;
  mocks.tapHandlers.length = 0;
  mocks.launchUrl = null;
  mocks.order.length = 0;
  mocks.setSession.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
});
afterEach(() => vi.restoreAllMocks());

async function mountLoggedIn() {
  render(<App />);
  await screen.findByTestId("shell", {}, { timeout: 5000 });
  await waitFor(() => expect(mocks.urlHandlers.length).toBeGreaterThan(0));
  await waitFor(() => expect(mocks.tapHandlers.length).toBeGreaterThan(0));
}

describe("App native — destinations des liens et des notifications", () => {
  it("clic sur une notification (data.url) : la destination validée est transmise à SocialShell", async () => {
    await mountLoggedIn();
    act(() => mocks.tapHandlers[0](`/messages/${UUID}`));
    await waitFor(() => expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", `messages:${UUID}`));
    expect(mocks.shell.props.deepLink.at).toBeTypeOf("number");
    // SocialShell la consomme : App la remet à zéro.
    act(() => mocks.shell.props.onDeepLinkHandled());
    await waitFor(() => expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", ""));
  });

  it("App Link ouvert pendant que l'app tourne : /event/<uuid> et /community/<uuid>", async () => {
    await mountLoggedIn();
    act(() => mocks.urlHandlers[0](`${ORIGIN}/event/${UUID}`));
    await waitFor(() => expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", `event:${UUID}`));
    act(() => mocks.urlHandlers[0](`${ORIGIN}/community/${UUID}`));
    await waitFor(() => expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", `community:${UUID}`));
  });

  it("lien qui a lancé l'app à froid : pris en compte", async () => {
    mocks.launchUrl = `${ORIGIN}/profile/${UUID}`;
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", `profile:${UUID}`), { timeout: 5000 });
  });

  it.each([
    ["autre domaine", `https://evil.example/event/${UUID}`],
    ["id invalide", `${ORIGIN}/event/pas-un-uuid`],
    ["chemin inconnu", `${ORIGIN}/admin/${UUID}`],
    ["schéma javascript", "javascript:alert(1)"],
    ["domaine@evil", `https://baobab-app-zeta.vercel.app@evil.example/event/${UUID}`],
  ])("lien invalide ou malveillant (%s) : ignoré, rien n'est ouvert, aucune erreur", async (_l, url) => {
    await mountLoggedIn();
    act(() => mocks.urlHandlers[0](url));
    act(() => mocks.tapHandlers[0](url));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", "");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("le même lien reçu deux fois de suite (lancement à froid : launchUrl + appUrlOpen) n'est traité qu'une fois", async () => {
    mocks.launchUrl = `${ORIGIN}/event/${UUID}`;
    await mountLoggedIn();
    await waitFor(() => expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", `event:${UUID}`));
    const first = mocks.shell.props.deepLink.seq;
    act(() => mocks.shell.props.onDeepLinkHandled());
    act(() => mocks.urlHandlers[0](`${ORIGIN}/event/${UUID}`));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", "");
    expect(first).toBe(1);
  });
});

describe("App native — lien de réinitialisation de mot de passe", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
  const recoveryUrl = `${ORIGIN}/update-password#access_token=${jwt}&refresh_token=refresh123&type=recovery`;

  it("établit la session de récupération et affiche l'écran « Nouveau mot de passe », sans rien journaliser", async () => {
    await mountLoggedIn();
    act(() => mocks.urlHandlers[0](recoveryUrl));
    await waitFor(() => expect(mocks.setSession).toHaveBeenCalledWith({ access_token: jwt, refresh_token: "refresh123" }));
    expect(await screen.findByRole("button", { name: "Mettre à jour le mot de passe" }, { timeout: 15000 })).toBeInTheDocument();
    // Les jetons ne fuient dans aucun journal.
    const logged = JSON.stringify([...console.log.mock.calls, ...console.error.mock.calls, ...console.warn.mock.calls]);
    expect(logged).not.toContain(jwt);
    expect(logged).not.toContain("refresh123");
  }, 30000);

  it("jeton refusé par Supabase : aucun écran de nouveau mot de passe, pas de plantage, jeton non journalisé", async () => {
    mocks.setSession.mockResolvedValue({ error: { message: "invalid JWT: " + jwt } });
    await mountLoggedIn();
    act(() => mocks.urlHandlers[0](recoveryUrl));
    await waitFor(() => expect(mocks.setSession).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: "Mettre à jour le mot de passe" })).not.toBeInTheDocument();
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    const logged = JSON.stringify([...console.log.mock.calls, ...console.error.mock.calls, ...console.warn.mock.calls]);
    expect(logged).not.toContain(jwt);
  });

  it("lien de récupération d'un autre domaine : setSession n'est jamais appelé", async () => {
    await mountLoggedIn();
    act(() => mocks.urlHandlers[0](`https://evil.example/update-password#access_token=${jwt}&refresh_token=r&type=recovery`));
    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});

describe("App native — déconnexion", () => {
  it("supprime le jeton push de CET appareil AVANT la déconnexion (RLS) en gardant le choix de l'utilisateur, et oublie le lien en attente", async () => {
    await mountLoggedIn();
    act(() => mocks.urlHandlers[0](`${ORIGIN}/event/${UUID}`));
    await waitFor(() => expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", `event:${UUID}`));
    await act(async () => { await mocks.shell.props.handleSignOut(); });
    expect(mocks.disablePush).toHaveBeenCalledWith({ signOut: true });
    expect(mocks.order.slice(0, 2)).toEqual(["disablePush", "signOut"]);
  });
});

describe("App web : aucun écouteur natif", () => {
  it("sur le web, aucun écouteur de lien n'est installé et un lien n'ouvre rien", async () => {
    mocks.native = false;
    render(<App />);
    await screen.findByTestId("shell", {}, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.urlHandlers).toHaveLength(0);
    expect(mocks.tapHandlers).toHaveLength(0);
    expect(mocks.syncPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("shell")).toHaveAttribute("data-deeplink", "");
  });
});
