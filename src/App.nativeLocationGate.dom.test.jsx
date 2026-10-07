import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Garde-fou d'accès « localisation requise » (App.jsx), étape 3b : en natif l'état de la
// permission vient du plugin (relu au retour au premier plan) ; sur le web,
// navigator.permissions.query reste la SEULE source, comme avant.

const mocks = vi.hoisted(() => ({
  native: true,
  permission: "denied",
  resumeHandlers: [],
  checkNative: vi.fn(),
  orderLog: [],
}));

vi.mock("./lib/platform", () => ({ isNative: () => mocks.native, getPlatform: () => (mocks.native ? "android" : "web") }));
vi.mock("./lib/nativeApp", () => ({
  onAppStateChange: async (cb) => { mocks.resumeHandlers.push(cb); return () => {}; },
  onAppUrlOpen: async () => () => {},
  getLaunchUrl: async () => null,
}));
vi.mock("./lib/nativePush", () => ({
  listenNotificationTaps: async () => () => {},
  syncNativePushRegistration: async () => false,
  getNativePushStatus: async () => ({ supported: false, permission: "unsupported", subscribed: false }),
  enableNativePush: async () => ({}),
  disableNativePush: async () => {},
}));
vi.mock("./lib/nativeGeolocation", () => ({
  checkNativeLocationPermission: (...a) => mocks.checkNative(...a),
  locationSettingsPath: () => "Réglages, Applications, Baobab, Autorisations, Position",
}));
vi.mock("./components/SocialShell", () => ({ default: () => <div data-testid="shell" /> }));

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

const realPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = true;
  mocks.permission = "denied";
  mocks.resumeHandlers.length = 0;
  mocks.checkNative.mockImplementation(async () => mocks.permission);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
});
afterEach(() => {
  vi.restoreAllMocks();
  if (realPermissions) Object.defineProperty(navigator, "permissions", realPermissions);
  else delete navigator.permissions;
});

describe("App native : garde-fou de localisation", () => {
  it("permission refusée côté plugin : écran « Localisation requise » ; réaccordée dans les réglages puis retour au premier plan : l'accès est rendu", async () => {
    const query = vi.fn(() => Promise.resolve({ state: "granted" }));
    Object.defineProperty(navigator, "permissions", { value: { query }, configurable: true });
    render(<App />);
    await screen.findByText("Localisation requise", {}, { timeout: 5000 });
    // En natif, navigator.permissions n'est PAS consulté (incomplet dans la WebView).
    expect(query).not.toHaveBeenCalled();
    expect(screen.queryByTestId("shell")).toBeNull();

    mocks.permission = "granted"; // l'utilisateur a autorisé dans les réglages du téléphone
    await waitFor(() => expect(mocks.resumeHandlers.length).toBeGreaterThan(0));
    await act(async () => { mocks.resumeHandlers.forEach((cb) => cb({ isActive: true })); });
    await screen.findByTestId("shell", {}, { timeout: 5000 });
  });

  it("permission « prompt » ou inconnue (null) : aucun blocage", async () => {
    mocks.permission = "prompt";
    render(<App />);
    await screen.findByTestId("shell", {}, { timeout: 5000 });
    expect(screen.queryByText("Localisation requise")).toBeNull();
  });
});

describe("App web : garde-fou de localisation inchangé", () => {
  it("web : navigator.permissions.query est la source ; le plugin n'est jamais interrogé", async () => {
    mocks.native = false;
    const query = vi.fn(() => Promise.resolve({ state: "denied", onchange: null }));
    Object.defineProperty(navigator, "permissions", { value: { query }, configurable: true });
    render(<App />);
    await screen.findByText("Localisation requise", {}, { timeout: 5000 });
    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(mocks.checkNative).not.toHaveBeenCalled();
    expect(mocks.resumeHandlers.length).toBe(0);
  });
});
