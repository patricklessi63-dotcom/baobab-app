import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Audit de robustesse réseau (6 oct. 2026) — tests d'intégration du VRAI App.jsx
// (SocialShell est remplacé par une coquille qui expose les props d'App et
// affiche les messages). Le client Supabase est un faux client en mémoire dont
// on pilote les coupures : requête qui n'aboutit jamais, ou réponse perdue
// alors que l'INSERT a bien été exécuté côté serveur.

const mocks = vi.hoisted(() => ({
  shell: { props: null },
  channels: [],
  db: null,
}));

vi.mock("./components/SocialShell", () => ({
  default: (props) => {
    mocks.shell.props = props;
    return (
      <div data-testid="shell">
        <ul>
          {props.messages.map((m) => (
            <li key={m.id} data-testid="msg" data-status={m._status || "ok"}>{m.text}</li>
          ))}
        </ul>
      </div>
    );
  },
}));

vi.mock("./supabaseClient", () => {
  const ME_AUTH = "auth-me";
  const makeBuilder = (table) => {
    const ctx = { table, op: "select", row: null, filters: [] };
    const b = {};
    const chain = (name, fn) => { b[name] = vi.fn((...args) => { if (fn) fn(...args); return b; }); };
    ["select", "neq", "lt", "lte", "order", "range", "limit", "is", "ilike", "or", "match", "contains", "not", "update", "delete", "upsert"].forEach((m) => chain(m));
    chain("eq", (c, v) => ctx.filters.push((r) => r[c] === v));
    chain("gt", (c, v) => ctx.filters.push((r) => r[c] > v));
    chain("gte", (c, v) => ctx.filters.push((r) => r[c] >= v));
    chain("in", (c, vals) => ctx.filters.push((r) => vals.includes(r[c])));
    chain("insert", (row) => { ctx.op = "insert"; ctx.row = row; });
    const run = (single) => Promise.resolve(mocks.db.resolve(ctx, single));
    b.single = vi.fn(() => run(true));
    b.maybeSingle = vi.fn(() => run(true));
    b.then = (resolve, reject) => run(false).then(resolve, reject);
    return b;
  };
  const supabase = {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: ME_AUTH, email: "me@x.test" } } } })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: ME_AUTH } } })),
      onAuthStateChange: vi.fn((cb) => {
        setTimeout(() => cb("INITIAL_SESSION", { user: { id: ME_AUTH, email: "me@x.test" } }), 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    from: vi.fn((table) => makeBuilder(table)),
    rpc: vi.fn(() => Promise.resolve({ data: { likers: [], admirers_count: 0 }, error: null })),
    channel: vi.fn((name) => {
      const ch = { name, handlers: [] };
      ch.on = vi.fn((type, opts, cb) => { ch.handlers.push({ type, opts, cb }); return ch; });
      ch.subscribe = vi.fn(() => ch);
      ch.send = vi.fn();
      mocks.channels.push(ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(() => Promise.resolve({})), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  };
  return { supabase };
});

import App from "./App";

const ME = "profile-me";
const OTHER = "profile-other";
const KEY = [ME, OTHER].sort().join("__");
const OTHER_PROFILE = { id: OTHER, name: "Awa" };
const netErr = { message: "TypeError: Failed to fetch", code: "" };

function makeDb() {
  const state = {
    messages: [],
    nextId: 1,
    ownProfileError: null, // erreur renvoyée par select("*") du propre profil
    insertMode: "ok", // ok | lost-response | never-sent
    messageReadsFail: false,
    insertCalls: 0,
    messageSelectCalls: 0,
    ownProfileCalls: 0,
    resolve(ctx, single) {
      if (ctx.table === "profiles" && single) {
        state.ownProfileCalls += 1;
        if (state.ownProfileError) return { data: null, error: state.ownProfileError };
        return { data: { id: ME, user_id: "auth-me", name: "Moi", onboarding_completed_at: "2026-01-01T00:00:00Z" }, error: null };
      }
      if (ctx.table === "messages" && ctx.op === "insert") {
        state.insertCalls += 1;
        const persist = () => {
          const saved = { id: state.nextId++, created_at: new Date().toISOString(), read_at: null, ...ctx.row };
          state.messages.push(saved);
          return saved;
        };
        if (state.insertMode === "ok") return { data: persist(), error: null };
        if (state.insertMode === "lost-response") { persist(); return { data: null, error: netErr }; }
        return { data: null, error: netErr };
      }
      if (ctx.table === "messages" && ctx.op === "select") {
        state.messageSelectCalls += 1;
        if (state.messageReadsFail) return { data: null, error: netErr };
        const rows = state.messages.filter((r) => ctx.filters.every((f) => f(r)));
        return { data: rows.slice().reverse(), error: null };
      }
      return { data: single ? null : [], error: null };
    },
  };
  return state;
}

let onLine;
let visibility;
let now;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channels.length = 0;
  mocks.shell.props = null;
  mocks.db = makeDb();
  onLine = true;
  visibility = "visible";
  now = Date.now();
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => onLine);
  vi.spyOn(Date, "now").mockImplementation(() => now);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete document.visibilityState;
});

async function mountAndOpenChat() {
  render(<App />);
  await screen.findByTestId("shell", {}, { timeout: 5000 });
  await act(async () => { await mocks.shell.props.openChat(OTHER_PROFILE); });
  await waitFor(() => expect(mocks.shell.props.activeMatch?.id).toBe(OTHER));
}

async function typeAndSend(text) {
  act(() => mocks.shell.props.setMessageDraft(text));
  await waitFor(() => expect(mocks.shell.props.messageDraft).toBe(text));
  await act(async () => { mocks.shell.props.sendMessage(); });
}

const setOnLine = (value) => {
  onLine = value;
  act(() => { window.dispatchEvent(new Event(value ? "online" : "offline")); });
};

describe("App — écran « profil impossible à charger » (lancement sans réseau)", () => {
  it("affiche un message réseau lisible (pas « TypeError: Failed to fetch ») et se relance tout seul au retour en ligne", async () => {
    onLine = false;
    mocks.db.ownProfileError = netErr;
    render(<App />);
    await screen.findByText(/Impossible de charger ton profil/, {}, { timeout: 5000 });
    expect(screen.getByText(/Pas de connexion internet/)).toBeInTheDocument();
    expect(screen.queryByText(/TypeError/)).toBeNull();
    // Bandeau hors ligne visible aussi sur cet écran.
    expect(screen.getByText(/Connexion interrompue/)).toBeInTheDocument();

    // Le réseau revient : plus besoin de taper « Réessayer ».
    mocks.db.ownProfileError = null;
    setOnLine(true);
    await screen.findByTestId("shell", {}, { timeout: 5000 });
    expect(screen.queryByText(/Impossible de charger ton profil/)).toBeNull();
  });
});

