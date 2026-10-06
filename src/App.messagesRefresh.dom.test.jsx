import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Audit de régression, 2e passe (6 oct. 2026) — rechargement de fond de la
// conversation (reprise après veille / retour en ligne) sur le VRAI App.jsx :
// historique remonté sans trou, suppression/lecture jamais défaites par un
// instantané plus ancien, écho Realtime jamais écrasé, réponses hors d'ordre
// A -> B -> A, conversation vide + message optimiste.
// Le faux serveur honore order/limit/gte/or (curseur d'historique) et les UPDATE.

const mocks = vi.hoisted(() => ({
  shell: { props: null },
  channels: [],
  db: null,
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
            <li key={m.id} data-testid="msg" data-status={m._status || "ok"} data-deleted={m.deleted_at ? "1" : "0"} data-read={m.read_at ? "1" : "0"}>{m.text}</li>
          ))}
        </ul>
        <span data-testid="has-more">{props.hasMoreHistory ? "oui" : "non"}</span>
      </div>
    );
  },
}));

vi.mock("./supabaseClient", () => {
  const ME_AUTH = "auth-me";
  const makeBuilder = (table) => {
    const ctx = { table, op: "select", row: null, patch: null, filters: [], limit: null, older: null, calls: [] };
    const b = {};
    const chain = (name, fn) => { b[name] = vi.fn((...args) => { ctx.calls.push([name, ...args]); if (fn) fn(...args); return b; }); };
    ["select", "lt", "lte", "range", "ilike", "match", "contains", "not", "delete", "upsert"].forEach((m) => chain(m));
    chain("order");
    chain("limit", (n) => { ctx.limit = n; });
    chain("update", (patch) => { ctx.op = "update"; ctx.patch = patch; });
    chain("neq", (c, v) => ctx.filters.push((r) => r[c] !== v));
    chain("is", (c, v) => ctx.filters.push((r) => (v === null ? r[c] == null : r[c] === v)));
    chain("eq", (c, v) => ctx.filters.push((r) => r[c] === v));
    chain("gt", (c, v) => ctx.filters.push((r) => r[c] > v));
    chain("gte", (c, v) => ctx.filters.push((r) => r[c] >= v));
    chain("in", (c, vals) => ctx.filters.push((r) => vals.includes(r[c])));
    chain("or", (expr) => {
      // curseur d'historique : created_at.lt.T,and(created_at.eq.T,id.lt.N)
      const m = /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.(\d+)\)$/.exec(expr);
      if (m) ctx.filters.push((r) => r.created_at < m[1] || (r.created_at === m[2] && r.id < Number(m[3])));
    });
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
const OTHER2 = "profile-other2";
const keyWith = (id) => [ME, id].sort().join("__");
const KEY = keyWith(OTHER);
const OTHER_PROFILE = { id: OTHER, name: "Awa" };
const OTHER2_PROFILE = { id: OTHER2, name: "Binta" };

const isoAt = (n) => `${new Date(Date.UTC(2026, 9, 1) + n * 1000).toISOString().slice(0, -1)}000+00:00`;

function makeDb() {
  const state = {
    messages: [],
    nextId: 1,
    clock: 0,
    holdSelects: false,
    heldSelects: [],
    deferInserts: false,
    pending: [],
    selectLog: [], // { limit, gte, key }
    addRow(extra) {
      state.clock += 1;
      const row = { id: state.nextId++, match_key: KEY, from_id: OTHER, kind: "text", text: `m${state.nextId - 1}`, created_at: isoAt(state.clock), read_at: null, deleted_at: null, deleted_by: null, deleted_for: [], ...extra };
      state.messages.push(row);
      return row;
    },
    resolve(ctx, single) {
      if (ctx.table === "profiles" && single) {
        return { data: { id: ME, user_id: "auth-me", name: "Moi", onboarding_completed_at: "2026-01-01T00:00:00Z" }, error: null };
      }
      if (ctx.table === "messages" && ctx.op === "insert") {
        const persist = () => {
          state.clock += 1;
          const saved = { id: state.nextId++, created_at: isoAt(state.clock), read_at: null, deleted_at: null, deleted_by: null, deleted_for: [], ...ctx.row };
          state.messages.push(saved);
          return saved;
        };
        if (!state.deferInserts) return { data: persist(), error: null };
        return new Promise((resolveInsert) => {
          state.pending.push({ commit: () => persist(), answer: (saved) => resolveInsert({ data: saved, error: null }) });
        });
      }
      if (ctx.table === "messages" && ctx.op === "update") {
        for (const r of state.messages.filter((x) => ctx.filters.every((f) => f(x)))) Object.assign(r, ctx.patch);
        return { data: null, error: null };
      }
      if (ctx.table === "messages" && ctx.op === "select") {
        const gteCall = ctx.calls.find((c) => c[0] === "gte");
        state.selectLog.push({ limit: ctx.limit, gte: gteCall ? gteCall[2] : null });
        const rows = state.messages
          .filter((r) => ctx.filters.every((f) => f(r)))
          .sort((x, y) => (x.created_at === y.created_at ? y.id - x.id : x.created_at < y.created_at ? 1 : -1))
          .slice(0, ctx.limit ?? Infinity)
          .map((r) => ({ ...r }));
        const snapshot = { data: rows, error: null };
        if (state.holdSelects) return new Promise((resolveSelect) => state.heldSelects.push(() => resolveSelect(snapshot)));
        return snapshot;
      }
      return { data: single ? null : [], error: null };
    },
  };
  return state;
}

let visibility;
let now;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channels.length = 0;
  mocks.shell.props = null;
  mocks.db = makeDb();
  visibility = "visible";
  now = Date.now();
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

async function mountShell() {
  render(<App />);
  await screen.findByTestId("shell", {}, { timeout: 5000 });
}
async function mountAndOpenChat(profile = OTHER_PROFILE) {
  await mountShell();
  await act(async () => { await mocks.shell.props.openChat(profile); });
  await waitFor(() => expect(mocks.shell.props.activeMatch?.id).toBe(profile.id));
}
const handler = (key, event) => {
  const channel = mocks.channels.find((c) => c.name === `messages:${key}`);
  return channel.handlers.find((h) => h.type === "postgres_changes" && h.opts.event === event);
};
const texts = () => screen.queryAllByTestId("msg").map((el) => el.textContent);
const resume = async () => {
  act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
  now += 3 * 60_000;
  act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
};

describe("reprise après veille — historique remonté", () => {
  it("plus d'une page de nouveaux messages pendant l'absence : aucun TROU, la liste est contiguë (ids 1 à 90)", async () => {
    for (let i = 0; i < 40; i += 1) mocks.db.addRow();
    await mountAndOpenChat();
    expect(texts()).toHaveLength(30); // la dernière page
    await act(async () => { await mocks.shell.props.onLoadOlder(); });
    await waitFor(() => expect(texts()).toHaveLength(40));
    // Veille : 50 messages arrivent, le websocket n'a rien livré.
    for (let i = 0; i < 50; i += 1) mocks.db.addRow();
    await resume();
    await waitFor(() => expect(texts()).toHaveLength(90));
    expect(texts()).toEqual(Array.from({ length: 90 }, (_, i) => `m${i + 1}`));
  });

  it("le rechargement relit depuis le plus ancien message affiché (une page à l'ouverture, tout l'historique ensuite)", async () => {
    for (let i = 0; i < 40; i += 1) mocks.db.addRow();
    await mountAndOpenChat();
    expect(mocks.db.selectLog.at(-1)).toEqual({ limit: 30, gte: null });
    await act(async () => { await mocks.shell.props.onLoadOlder(); });
    await resume();
    const last = mocks.db.selectLog.at(-1);
    expect(last.limit).toBe(500);
    expect(last.gte).toBe(mocks.db.messages[0].created_at);
  });

  it("suppression « pour tous » et lecture survenues pendant l'absence sur une ligne d'historique déjà remonté : reflétées", async () => {
    for (let i = 0; i < 40; i += 1) mocks.db.addRow({ from_id: ME });
    await mountAndOpenChat();
    await act(async () => { await mocks.shell.props.onLoadOlder(); });
    await waitFor(() => expect(texts()).toHaveLength(40));
    expect(screen.getAllByTestId("msg").every((el) => el.dataset.deleted === "0" && el.dataset.read === "0")).toBe(true);
    Object.assign(mocks.db.messages[1], { deleted_at: isoAt(500), deleted_by: ME }); // ligne ancienne (hors dernière page)
    mocks.db.messages[2].read_at = isoAt(501);
    await resume();
    const items = screen.getAllByTestId("msg");
    expect(items[1].dataset.deleted).toBe("1");
    expect(items[2].dataset.read).toBe("1");
  });
});

describe("rechargement en vol — jamais d'effet défait ni de message écrasé", () => {
  const startHeldRefresh = async () => {
    mocks.db.holdSelects = true;
    let refresh;
    act(() => { refresh = mocks.shell.props.openChat(OTHER_PROFILE); });
    await waitFor(() => expect(mocks.db.heldSelects).toHaveLength(1));
    return { refresh }; // objet : une promesse retournée par une fonction async serait attendue
  };

  it("l'autre supprime un message (écho UPDATE) pendant que la requête est en vol : le message ne RÉAPPARAÎT pas avec l'instantané plus ancien", async () => {
    for (let i = 0; i < 3; i += 1) mocks.db.addRow({ from_id: ME });
    await mountAndOpenChat();
    const { refresh } = await startHeldRefresh();
    const target = mocks.db.messages[1];
    Object.assign(target, { deleted_at: isoAt(900), deleted_by: ME, read_at: isoAt(901) });
    act(() => handler(KEY, "UPDATE").cb({ new: { ...target } }));
    expect(screen.getAllByTestId("msg")[1].dataset.deleted).toBe("1");
    await act(async () => { mocks.db.heldSelects[0](); await refresh; }); // instantané pris AVANT la suppression
    expect(screen.getAllByTestId("msg")[1].dataset.deleted).toBe("1");
    expect(screen.getAllByTestId("msg")[1].dataset.read).toBe("1");
  });

  it("je supprime pour tous un de mes messages pendant le rechargement : il reste supprimé à l'arrivée de l'instantané", async () => {
    for (let i = 0; i < 3; i += 1) mocks.db.addRow({ from_id: ME });
    await mountAndOpenChat();
    const { refresh } = await startHeldRefresh();
    const target = mocks.shell.props.messages[1];
    await act(async () => { await mocks.shell.props.deleteMessageForEveryone(target); });
    expect(screen.getAllByTestId("msg")[1].dataset.deleted).toBe("1");
    await act(async () => { mocks.db.heldSelects[0](); await refresh; });
    expect(screen.getAllByTestId("msg")[1].dataset.deleted).toBe("1");
  });

  it("écho Realtime reçu juste avant l'arrivée de l'instantané (état pas encore rendu) : le message n'est pas écrasé", async () => {
    for (let i = 0; i < 3; i += 1) mocks.db.addRow();
    await mountAndOpenChat();
    const { refresh } = await startHeldRefresh();
    const fresh = mocks.db.addRow({ text: "arrivé pendant le vol" }); // absent de l'instantané déjà pris
    await act(async () => {
      handler(KEY, "INSERT").cb({ new: { ...fresh } });
      mocks.db.heldSelects[0]();
      await refresh;
    });
    expect(texts()).toEqual(["m1", "m2", "m3", "arrivé pendant le vol"]);
  });

  it("conversation vide + message optimiste en vol + rechargement (instantané vide) : la bulle reste, puis une seule ligne confirmée", async () => {
    await mountAndOpenChat();
    mocks.db.deferInserts = true;
    act(() => mocks.shell.props.setMessageDraft("premier"));
    await waitFor(() => expect(mocks.shell.props.messageDraft).toBe("premier"));
    await act(async () => { mocks.shell.props.sendMessage(); });
    await waitFor(() => expect(mocks.db.pending).toHaveLength(1));
    await resume(); // instantané vide : l'INSERT n'est pas encore appliqué
    expect(texts()).toEqual(["premier"]);
    expect(screen.getByTestId("msg").dataset.status).toBe("sending");
    const saved = mocks.db.pending[0].commit();
    await act(async () => { mocks.db.pending[0].answer(saved); });
    await waitFor(() => expect(screen.getByTestId("msg").dataset.status).toBe("ok"));
    expect(texts()).toEqual(["premier"]);
  });
});

describe("changement rapide de conversation A -> B -> A pendant le rechargement", () => {
  const addB = (n) => { for (let i = 0; i < n; i += 1) mocks.db.addRow({ match_key: keyWith(OTHER2), from_id: OTHER2, text: `B${i + 1}` }); };
  const addA = (n) => { for (let i = 0; i < n; i += 1) mocks.db.addRow({ text: `A${i + 1}` }); };

  it.each([
    ["1,0,2 (réponse tardive de la 1re ouverture de A)", [1, 0, 2]],
    ["2,1,0 (la dernière arrive d'abord)", [2, 1, 0]],
    ["0,2,1", [0, 2, 1]],
  ])("réponses hors d'ordre %s : seule la dernière ouverture (A) s'affiche, B n'écrase rien", async (_label, order) => {
    addA(3); addB(2);
    await mountShell();
    mocks.db.holdSelects = true;
    const opens = [];
    act(() => { opens.push(mocks.shell.props.openChat(OTHER_PROFILE)); });
    await waitFor(() => expect(mocks.db.heldSelects).toHaveLength(1));
    act(() => { opens.push(mocks.shell.props.openChat(OTHER2_PROFILE)); });
    await waitFor(() => expect(mocks.db.heldSelects).toHaveLength(2));
    act(() => { opens.push(mocks.shell.props.openChat(OTHER_PROFILE)); });
    await waitFor(() => expect(mocks.db.heldSelects).toHaveLength(3));
    for (const i of order) await act(async () => { mocks.db.heldSelects[i](); await opens[i]; });
    expect(mocks.shell.props.activeMatch.id).toBe(OTHER);
    expect(texts()).toEqual(["A1", "A2", "A3"]);
  });

  it("B ouverte en dernier : seules les lignes de B s'affichent, même si la réponse de A arrive après", async () => {
    addA(3); addB(2);
    await mountShell();
    mocks.db.holdSelects = true;
    const opens = [];
    act(() => { opens.push(mocks.shell.props.openChat(OTHER_PROFILE)); });
    await waitFor(() => expect(mocks.db.heldSelects).toHaveLength(1));
    act(() => { opens.push(mocks.shell.props.openChat(OTHER2_PROFILE)); });
    await waitFor(() => expect(mocks.db.heldSelects).toHaveLength(2));
    await act(async () => { mocks.db.heldSelects[1](); await opens[1]; });
    await act(async () => { mocks.db.heldSelects[0](); await opens[0]; });
    expect(texts()).toEqual(["B1", "B2"]);
    expect(mocks.shell.props.messages.every((m) => m.match_key === keyWith(OTHER2))).toBe(true);
  });
});
