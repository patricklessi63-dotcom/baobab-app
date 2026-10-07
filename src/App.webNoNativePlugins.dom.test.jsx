import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// Le WEB ne doit charger AUCUN plugin Capacitor au démarrage (ni après des interactions
// courantes) : tous les plugins natifs sont derrière isNative() + import() dynamique.
// Chaque plugin est simulé avec une fabrique qui compte son chargement ; platform.js n'est
// PAS simulé (le vrai Capacitor.isNativePlatform() vaut false sous jsdom).

const { loaded, plugin } = vi.hoisted(() => {
  const loaded = {};
  const plugin = (name, exportsObj) => () => {
    loaded[name] = (loaded[name] || 0) + 1;
    return exportsObj;
  };
  return { loaded, plugin };
});
vi.mock("@capacitor/app", plugin("app", { App: {} }));
vi.mock("@capacitor/camera", plugin("camera", { Camera: {} }));
vi.mock("@capacitor/geolocation", plugin("geolocation", { Geolocation: {} }));
vi.mock("@capacitor/haptics", plugin("haptics", { Haptics: {}, ImpactStyle: {}, NotificationType: {} }));
vi.mock("@capacitor/keyboard", plugin("keyboard", { Keyboard: {} }));
vi.mock("@capacitor/push-notifications", plugin("push-notifications", { PushNotifications: {} }));
vi.mock("@capacitor/share", plugin("share", { Share: {} }));
vi.mock("@capacitor/splash-screen", plugin("splash-screen", { SplashScreen: {} }));
vi.mock("@capacitor/status-bar", plugin("status-bar", { StatusBar: {}, Style: {} }));

const mocks = vi.hoisted(() => ({ authCb: null, setSession: vi.fn(), signOut: vi.fn() }));

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
import { hapticLight, hapticSuccess, hapticError } from "./lib/haptics";
import { shareNative } from "./lib/nativeShare";
import { takePhoto } from "./lib/nativeCamera";
import { startNativeBack } from "./lib/nativeBack";
import { applySystemBars, hideSplash, setupKeyboardGuard } from "./lib/nativeUi";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("web : aucun plugin Capacitor chargé", () => {
  it("au démarrage de l'app connectée, puis après les points d'entrée natifs appelés sur le web", async () => {
    render(<App />);
    await screen.findByTestId("shell", {}, { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(loaded).toEqual({});

    // Les points d'entrée natifs, appelés sur le web, sont des no-op qui ne chargent rien.
    hapticLight(); hapticSuccess(); hapticError();
    await shareNative({ text: "x" });
    await takePhoto();
    await applySystemBars({ top: "dark" });
    await hideSplash();
    const stopKeyboard = await setupKeyboardGuard();
    const stopBack = await startNativeBack();
    stopKeyboard(); stopBack();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(loaded).toEqual({});
  });
});
