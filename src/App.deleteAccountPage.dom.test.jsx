import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Page publique /suppression-compte (URL à fournir à Google Play pour la demande de
// suppression de compte hors application). Contrairement aux autres pages publiques,
// elle s'affiche aussi pour une personne CONNECTÉE (elle n'est pas renvoyée vers « / »).

const mocks = vi.hoisted(() => ({ signedIn: false }));

vi.mock("./components/SocialShell", () => ({ default: () => <div data-testid="shell" /> }));

vi.mock("./supabaseClient", () => {
  const ME_AUTH = "auth-me";
  const makeBuilder = (table) => {
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
      getSession: vi.fn(() => Promise.resolve({ data: { session: mocks.signedIn ? { user: { id: ME_AUTH } } : null } })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: ME_AUTH } } })),
      onAuthStateChange: vi.fn((cb) => {
        setTimeout(() => cb("INITIAL_SESSION", mocks.signedIn ? { user: { id: ME_AUTH, email: "me@x.test" } } : null), 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      setSession: vi.fn(),
      signOut: vi.fn(),
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("page publique /suppression-compte", () => {
  it("s'affiche pour un visiteur non connecté, avec le chemin dans l'application", async () => {
    mocks.signedIn = false;
    window.history.pushState({}, "", "/suppression-compte");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Supprimer mon compte Baobab" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Zone de danger/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/suppression-compte");
  });

  it("s'affiche aussi pour une personne connectée (pas de redirection vers l'accueil)", async () => {
    mocks.signedIn = true;
    window.history.pushState({}, "", "/suppression-compte");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Supprimer mon compte Baobab" }, { timeout: 5000 })).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/suppression-compte");
  });

  it("est atteignable depuis le pied de page de l'accueil", async () => {
    mocks.signedIn = false;
    window.history.pushState({}, "", "/");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Suppression de compte" }, { timeout: 5000 }));
    expect(await screen.findByRole("heading", { name: "Supprimer mon compte Baobab" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/suppression-compte");
  });
});
