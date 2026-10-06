import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Audit de régression du lot « robustesse réseau » (6 oct. 2026) — CHEMIN NORMAL
// (réseau OK) de la messagerie : un seul INSERT, aucune lecture « fantôme »,
// pas de doublon avec l'écho Realtime, pas de fuite entre conversations.

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

const echoHandler = (key) => {
  const channel = mocks.channels.find((c) => c.name === `messages:${key}`);
  return channel.handlers.find((h) => h.type === "postgres_changes" && h.opts.event === "INSERT");
};

describe("App — envoi de message, chemin normal (réseau OK)", () => {
  it("« ok » envoyé deux fois d'affilée volontairement : deux INSERT, deux bulles, aucune lecture fantôme", async () => {
    await mountAndOpenChat();
    const readsBefore = mocks.db.messageSelectCalls;
    await typeAndSend("ok");
    await waitFor(() => expect(screen.getByTestId("msg")).toHaveAttribute("data-status", "ok"));
    await typeAndSend("ok");
    await waitFor(() => expect(screen.getAllByTestId("msg")).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByTestId("msg").every((el) => el.getAttribute("data-status") === "ok")).toBe(true));
    expect(mocks.db.insertCalls).toBe(2);
    expect(mocks.db.messages).toHaveLength(2);
    expect(mocks.db.messageSelectCalls).toBe(readsBefore); // aucune sonde fantôme
  });

  it("écho Realtime arrivé AVANT la réponse de l'INSERT : une seule bulle", async () => {
    await mountAndOpenChat();
    mocks.db.deferInserts = true;
    await typeAndSend("salut");
    await waitFor(() => expect(mocks.db.pending).toHaveLength(1));
    const saved = mocks.db.pending[0].commit();
    act(() => echoHandler(KEY).cb({ new: saved }));
    await act(async () => { mocks.db.pending[0].answer(saved); });
    await waitFor(() => expect(screen.getAllByTestId("msg")).toHaveLength(1));
    expect(screen.getByTestId("msg")).toHaveAttribute("data-status", "ok");
  });

  it("écho Realtime arrivé APRÈS la réponse de l'INSERT : une seule bulle", async () => {
    await mountAndOpenChat();
    await typeAndSend("salut");
    await waitFor(() => expect(screen.getByTestId("msg")).toHaveAttribute("data-status", "ok"));
    act(() => echoHandler(KEY).cb({ new: mocks.db.messages[0] }));
    expect(screen.getAllByTestId("msg")).toHaveLength(1);
  });

  it("deux envois rapides alors que le premier est encore en vol : ordre conservé, deux bulles", async () => {
    await mountAndOpenChat();
    mocks.db.deferInserts = true;
    await typeAndSend("a");
    await typeAndSend("b");
    await waitFor(() => expect(mocks.db.pending).toHaveLength(2));
    const a = mocks.db.pending[0].commit();
    const b = mocks.db.pending[1].commit();
    await act(async () => { mocks.db.pending[1].answer(b); mocks.db.pending[0].answer(a); });
    await waitFor(() => expect(screen.getAllByTestId("msg").every((el) => el.getAttribute("data-status") === "ok")).toBe(true));
    expect(screen.getAllByTestId("msg").map((el) => el.textContent)).toEqual(["a", "b"]);
  });

  it("message envoyé dans la conversation A dont l'accusé arrive APRÈS l'ouverture de la conversation B : il n'apparaît PAS dans B", async () => {
    await mountAndOpenChat();
    mocks.db.deferInserts = true;
    await typeAndSend("secret pour Awa");
    await waitFor(() => expect(mocks.db.pending).toHaveLength(1));
    // L'utilisateur quitte la conversation et en ouvre une autre pendant l'envoi lent.
    await act(async () => { mocks.shell.props.closeChat(); });
    await act(async () => { await mocks.shell.props.openChat(OTHER2_PROFILE); });
    await waitFor(() => expect(mocks.shell.props.activeMatch?.id).toBe(OTHER2));
    const saved = mocks.db.pending[0].commit();
    await act(async () => { mocks.db.pending[0].answer(saved); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByText("secret pour Awa")).toBeNull();
    expect(mocks.shell.props.messages.every((m) => m.match_key === keyWith(OTHER2))).toBe(true);
  });

  it("rechargement de la conversation en vol pendant qu'un message est envoyé puis confirmé : le message ne disparaît pas", async () => {
    await mountAndOpenChat();
    mocks.db.holdSelects = true;
    let refresh;
    act(() => { refresh = mocks.shell.props.openChat(OTHER_PROFILE); });
    await waitFor(() => expect(mocks.db.heldSelects).toHaveLength(1));
    await typeAndSend('envoyé pendant le rechargement');
    await waitFor(() => expect(screen.getByTestId('msg')).toHaveAttribute('data-status', 'ok'));
    await act(async () => { mocks.db.heldSelects[0](); await refresh; });
    expect(screen.getAllByTestId('msg').map((el) => el.textContent)).toEqual(['envoyé pendant le rechargement']);
  });

  describe('pièce jointe', () => {
    const makeFile = () => new File(['bonjour'], 'note.txt', { type: 'text/plain' });

    it('upload OK puis INSERT OK : une ligne, une bulle, le fichier est conservé, aucune sonde', async () => {
      await mountAndOpenChat();
      const readsBefore = mocks.db.messageSelectCalls;
      await act(async () => { await mocks.shell.props.sendMediaMessage(makeFile(), 'file'); });
      await waitFor(() => expect(screen.getByTestId('msg')).toHaveAttribute('data-status', 'ok'));
      expect(screen.getAllByTestId('msg')).toHaveLength(1);
      expect(mocks.db.insertCalls).toBe(1);
      expect(mocks.uploadSpy).toHaveBeenCalledTimes(1);
      expect(mocks.removeSpy).not.toHaveBeenCalled();
      expect(mocks.db.messageSelectCalls).toBe(readsBefore);
    });

    it('INSERT refusé par le serveur (erreur AVEC code) : bulle en échec, fichier nettoyé, aucune sonde fantôme', async () => {
      await mountAndOpenChat();
      mocks.db.insertError = { message: 'new row violates row-level security policy', code: '42501' };
      const readsBefore = mocks.db.messageSelectCalls;
      await act(async () => { await mocks.shell.props.sendMediaMessage(makeFile(), 'file'); });
      await waitFor(() => expect(screen.getByTestId('msg')).toHaveAttribute('data-status', 'failed'));
      expect(mocks.removeSpy).toHaveBeenCalledTimes(1);
      expect(mocks.db.messageSelectCalls).toBe(readsBefore);
    });
  });
});
