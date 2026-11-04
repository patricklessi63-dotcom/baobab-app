import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Brouillons de messages (lib/messageDrafts.js) branchés dans App.jsx : le texte non envoyé est restauré
// à la réouverture de LA MÊME conversation (même après rechargement), ne fuit pas dans une autre, et est
// supprimé à l'envoi.

const mocks = vi.hoisted(() => ({
  shell: { props: null },
  channels: [],
  db: null,
  removeSpy: vi.fn(() => Promise.resolve({})),
  uploadSpy: vi.fn(() => Promise.resolve()),
}));

vi.mock("./lib/uploadWithProgress", () => ({ uploadWithProgress: (...args) => mocks.uploadSpy(...args) }));

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
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: (...args) => mocks.removeSpy(...args), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  };
  return { supabase };
});

import App from "./App";

const ME = "profile-me";
const OTHER = "profile-other";
const OTHER2 = "profile-other2";
const keyWith = (id) => [ME, id].sort().join("__");
const KEY = keyWith(OTHER);
const OTHER_PROFILE = { id: OTHER, name: "Awa" };
const OTHER2_PROFILE = { id: OTHER2, name: "Binta" };

function makeDb() {
  const state = {
    messages: [],
    nextId: 1,
    insertCalls: 0,
    messageSelectCalls: 0,
    deferInserts: false,
    holdSelects: false,
    heldSelects: [],
    insertError: null, // erreur définitive renvoyée par le serveur (avec code)
    pending: [], // INSERT différés
    resolve(ctx, single) {
      if (ctx.table === "profiles" && single) {
        return { data: { id: ME, user_id: "auth-me", name: "Moi", onboarding_completed_at: "2026-01-01T00:00:00Z" }, error: null };
      }
      if (ctx.table === "messages" && ctx.op === "insert") {
        state.insertCalls += 1;
        if (state.insertError) return { data: null, error: state.insertError };
        const persist = () => {
          const saved = { id: state.nextId++, created_at: new Date().toISOString(), read_at: null, ...ctx.row };
          state.messages.push(saved);
          return saved;
        };
        if (!state.deferInserts) return { data: persist(), error: null };
        return new Promise((resolveInsert) => {
          state.pending.push({
            // Le serveur exécute l'INSERT, puis la réponse arrive (plus tard).
            commit: () => persist(),
            answer: (saved) => resolveInsert({ data: saved, error: null }),
          });
        });
      }
      if (ctx.table === "messages" && ctx.op === "select") {
        state.messageSelectCalls += 1;
        const rows = state.messages.filter((r) => ctx.filters.every((f) => f(r)));
        const snapshot = { data: rows.slice().reverse(), error: null };
        // Rechargement retenu : l'instantané est pris MAINTENANT, la réponse arrive plus tard.
        if (state.holdSelects) return new Promise((resolveSelect) => state.heldSelects.push(() => resolveSelect(snapshot)));
        return snapshot;
      }
      return { data: single ? null : [], error: null };
    },
  };
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channels.length = 0;
  mocks.shell.props = null;
  mocks.db = makeDb();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mountAndOpenChat(profile = OTHER_PROFILE) {
  render(<App />);
  await screen.findByTestId("shell", {}, { timeout: 5000 });
  await act(async () => { await mocks.shell.props.openChat(profile); });
  await waitFor(() => expect(mocks.shell.props.activeMatch?.id).toBe(profile.id));
}

async function typeAndSend(text) {
  act(() => mocks.shell.props.setMessageDraft(text));
  await waitFor(() => expect(mocks.shell.props.messageDraft).toBe(text));
  await act(async () => { mocks.shell.props.sendMessage(); });
}

const draftKey = (id) => `bb-draft:${ME}:${id}`;

describe("App — brouillons de messages", () => {
  beforeEach(() => localStorage.clear());

  it("enregistre le texte tapé et le restaure en rouvrant la même conversation", async () => {
    await mountAndOpenChat();
    act(() => mocks.shell.props.setMessageDraft("Je te réponds ce soir"));
    expect(JSON.parse(localStorage.getItem(draftKey(OTHER))).t).toBe("Je te réponds ce soir");
    await act(async () => { mocks.shell.props.closeChat(); });
    await waitFor(() => expect(mocks.shell.props.messageDraft).toBe(""));
    await act(async () => { await mocks.shell.props.openChat(OTHER_PROFILE); });
    await waitFor(() => expect(mocks.shell.props.messageDraft).toBe("Je te réponds ce soir"));
  });

  it("garde un brouillon distinct par conversation : celui d'Awa ne fuit pas chez Binta", async () => {
    await mountAndOpenChat();
    act(() => mocks.shell.props.setMessageDraft("pour Awa"));
    await act(async () => { await mocks.shell.props.openChat(OTHER2_PROFILE); });
    await waitFor(() => expect(mocks.shell.props.activeMatch?.id).toBe(OTHER2));
    expect(mocks.shell.props.messageDraft).toBe("");
    act(() => mocks.shell.props.setMessageDraft("pour Binta"));
    await act(async () => { await mocks.shell.props.openChat(OTHER_PROFILE); });
    await waitFor(() => expect(mocks.shell.props.messageDraft).toBe("pour Awa"));
    await act(async () => { await mocks.shell.props.openChat(OTHER2_PROFILE); });
    await waitFor(() => expect(mocks.shell.props.messageDraft).toBe("pour Binta"));
  });

  it("survit à un rechargement de la page (démontage puis nouveau montage)", async () => {
    const first = render(<App />);
    await screen.findByTestId("shell", {}, { timeout: 5000 });
    await act(async () => { await mocks.shell.props.openChat(OTHER_PROFILE); });
    act(() => mocks.shell.props.setMessageDraft("texte non envoyé"));
    first.unmount();
    mocks.shell.props = null;
    await mountAndOpenChat();
    await waitFor(() => expect(mocks.shell.props.messageDraft).toBe("texte non envoyé"));
  });

  it("supprime le brouillon après l'envoi : rouvrir la conversation donne une zone vide", async () => {
    await mountAndOpenChat();
    await typeAndSend("Bonjour");
    await waitFor(() => expect(screen.getByTestId("msg")).toHaveAttribute("data-status", "ok"));
    expect(localStorage.getItem(draftKey(OTHER))).toBeNull();
    await act(async () => { mocks.shell.props.closeChat(); });
    await act(async () => { await mocks.shell.props.openChat(OTHER_PROFILE); });
    await waitFor(() => expect(mocks.shell.props.activeMatch?.id).toBe(OTHER));
    expect(mocks.shell.props.messageDraft).toBe("");
  });

  it("enregistre aussi une mise à jour par fonction (ajout d'un emoji)", async () => {
    await mountAndOpenChat();
    act(() => mocks.shell.props.setMessageDraft("Merci"));
    act(() => mocks.shell.props.setMessageDraft((d) => d + " 🙏"));
    await waitFor(() => expect(mocks.shell.props.messageDraft).toBe("Merci 🙏"));
    expect(JSON.parse(localStorage.getItem(draftKey(OTHER))).t).toBe("Merci 🙏");
  });

  it("vider la zone de saisie à la main supprime le brouillon", async () => {
    await mountAndOpenChat();
    act(() => mocks.shell.props.setMessageDraft("à effacer"));
    act(() => mocks.shell.props.setMessageDraft(""));
    expect(localStorage.getItem(draftKey(OTHER))).toBeNull();
  });
});
