import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Audit messagerie du 1er nov. 2026 — logique App.jsx :
//  - « en train d'écrire » : limité à un envoi / 2 s, effacé à l'arrivée du
//    message, « enregistre un vocal » + arrêt explicite (idle) ;
//  - réactions : une seule par personne et par message (remplacement) ;
//  - transfert : texte / sticker / média (copie Storage, nettoyage si refus) ;
//  - métadonnées d'un vocal (durée, forme d'onde) conservées à l'envoi ET au renvoi.

const mocks = vi.hoisted(() => ({
  shell: { props: null },
  channels: [],
  db: null,
  log: [],
  storage: { copy: null, remove: null },
  uploadSpy: vi.fn(() => Promise.resolve()),
}));

vi.mock("./lib/uploadWithProgress", () => ({ uploadWithProgress: (...args) => mocks.uploadSpy(...args) }));

vi.mock("./components/SocialShell", () => ({
  default: (props) => {
    mocks.shell.props = props;
    return <div data-testid="shell" data-typing={String(props.otherTyping)} />;
  },
}));

vi.mock("./supabaseClient", () => {
  const ME_AUTH = "auth-me";
  const makeBuilder = (table) => {
    const ctx = { table, op: "select", row: null, filters: [], inFilters: [] };
    const b = {};
    const chain = (name, fn) => { b[name] = vi.fn((...args) => { if (fn) fn(...args); return b; }); };
    ["select", "neq", "lt", "lte", "order", "range", "limit", "is", "ilike", "or", "match", "contains", "not", "upsert"].forEach((m) => chain(m));
    chain("update", () => { ctx.op = "update"; });
    chain("delete", () => { ctx.op = "delete"; });
    chain("eq", (c, v) => ctx.filters.push((r) => r[c] === v));
    chain("gt", (c, v) => ctx.filters.push((r) => r[c] > v));
    chain("gte", (c, v) => ctx.filters.push((r) => r[c] >= v));
    chain("in", (c, vals) => { ctx.inFilters.push([c, vals]); ctx.filters.push((r) => vals.includes(r[c])); });
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
    storage: { from: vi.fn(() => ({ upload: vi.fn(), copy: (...a) => mocks.storage.copy(...a), remove: (...a) => mocks.storage.remove(...a), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
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
    insertError: null,
    reactions: [],
    resolve(ctx, single) {
      if (ctx.table === "profiles" && single) {
        return { data: { id: ME, user_id: "auth-me", name: "Moi", onboarding_completed_at: "2026-01-01T00:00:00Z" }, error: null };
      }
      if (ctx.op === "insert" || ctx.op === "delete" || ctx.op === "update") {
        mocks.log.push({ table: ctx.table, op: ctx.op, row: ctx.row, inFilters: ctx.inFilters });
      }
      if (ctx.table === "messages" && ctx.op === "insert") {
        if (state.insertError) return { data: null, error: state.insertError };
        const saved = { id: state.nextId++, created_at: new Date().toISOString(), read_at: null, ...ctx.row };
        state.messages.push(saved);
        return { data: saved, error: null };
      }
      if (ctx.table === "messages" && ctx.op === "select") {
        const rows = state.messages.filter((r) => ctx.filters.every((f) => f(r)));
        return { data: rows.slice().reverse(), error: null };
      }
      return { data: single ? null : [], error: null };
    },
  };
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channels.length = 0;
  mocks.log.length = 0;
  mocks.shell.props = null;
  mocks.db = makeDb();
  mocks.storage.copy = vi.fn(async () => ({ data: {}, error: null }));
  mocks.storage.remove = vi.fn(async () => ({ data: [], error: null }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function mountAndOpenChat(profile = OTHER_PROFILE) {
  render(<App />);
  await screen.findByTestId("shell", {}, { timeout: 5000 });
  await act(async () => { await mocks.shell.props.openChat(profile); });
  await waitFor(() => expect(mocks.shell.props.activeMatch?.id).toBe(profile.id));
}

const chan = (name) => mocks.channels.filter((c) => c.name === name).at(-1);
const typingHandler = () => chan(`typing:${KEY}`).handlers.find((h) => h.type === "broadcast");
const echoHandler = () => chan(`messages:${KEY}`).handlers.find((h) => h.type === "postgres_changes" && h.opts.event === "INSERT");

describe("App — indicateurs « écrit / enregistre »", () => {
  it("la frappe n'émet qu'un événement toutes les 2 s (pas un par touche)", async () => {
    await mountAndOpenChat();
    const send = chan(`typing:${KEY}`).send;
    for (let i = 0; i < 8; i += 1) act(() => mocks.shell.props.broadcastTyping());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].payload).toMatchObject({ user_id: ME, state: "typing" });
  });

  it("« enregistre » et « idle » ne sont jamais retenus par la limite de fréquence", async () => {
    await mountAndOpenChat();
    const send = chan(`typing:${KEY}`).send;
    act(() => mocks.shell.props.broadcastTyping("recording"));
    act(() => mocks.shell.props.broadcastTyping("recording"));
    act(() => mocks.shell.props.broadcastTyping("idle"));
    expect(send.mock.calls.map((c) => c[0].payload.state)).toEqual(["recording", "recording", "idle"]);
  });

  it("l'autre personne enregistre → otherTyping = « recording » ; « idle » l'efface aussitôt", async () => {
    await mountAndOpenChat();
    act(() => typingHandler().cb({ payload: { user_id: OTHER, state: "recording" } }));
    expect(mocks.shell.props.otherTyping).toBe("recording");
    act(() => typingHandler().cb({ payload: { user_id: OTHER, state: "idle" } }));
    expect(mocks.shell.props.otherTyping).toBe(false);
  });

  it("un ancien client sans « state » compte comme une frappe ; sa propre frappe est ignorée", async () => {
    await mountAndOpenChat();
    act(() => typingHandler().cb({ payload: { user_id: ME } }));
    expect(mocks.shell.props.otherTyping).toBe(false);
    act(() => typingHandler().cb({ payload: { user_id: OTHER } }));
    expect(mocks.shell.props.otherTyping).toBe("typing");
  });

  it("l'arrivée du message efface « en train d'écrire » tout de suite (pas 3 s plus tard)", async () => {
    await mountAndOpenChat();
    act(() => typingHandler().cb({ payload: { user_id: OTHER, state: "typing" } }));
    expect(mocks.shell.props.otherTyping).toBe("typing");
    act(() => echoHandler().cb({ new: { id: 50, match_key: KEY, from_id: OTHER, kind: "text", text: "coucou", created_at: new Date().toISOString(), read_at: null } }));
    expect(mocks.shell.props.otherTyping).toBe(false);
  });

  it("sans accusés de lecture activés, rien n'est émis (réciprocité de confidentialité)", async () => {
    mocks.db.resolve = ((orig) => (ctx, single) => {
      const r = orig(ctx, single);
      if (ctx.table === "profiles" && single) r.data.show_read_receipts = false;
      return r;
    })(mocks.db.resolve);
    await mountAndOpenChat();
    act(() => mocks.shell.props.broadcastTyping("recording"));
    expect(chan(`typing:${KEY}`).send).not.toHaveBeenCalled();
  });
});

describe("App — réactions : une seule par personne", () => {
  const msg = { id: 5, match_key: KEY };
  it("première réaction : INSERT seul", async () => {
    await mountAndOpenChat();
    await act(async () => { await mocks.shell.props.toggleReaction(msg, "❤️"); });
    const ops = mocks.log.filter((l) => l.table === "message_reactions");
    expect(ops.map((o) => o.op)).toEqual(["insert"]);
    expect(ops[0].row).toEqual({ message_id: 5, profile_id: ME, emoji: "❤️" });
    expect(mocks.shell.props.reactionsByMessageId[5]).toHaveLength(1);
  });

  it("un autre emoji REMPLACE la réaction (DELETE de l'ancienne puis INSERT), jamais deux pastilles à moi", async () => {
    await mountAndOpenChat();
    await act(async () => { await mocks.shell.props.toggleReaction(msg, "❤️"); });
    mocks.log.length = 0;
    await act(async () => { await mocks.shell.props.toggleReaction(msg, "😂"); });
    const ops = mocks.log.filter((l) => l.table === "message_reactions");
    expect(ops.map((o) => o.op)).toEqual(["delete", "insert"]);
    expect(ops[0].inFilters).toEqual([["emoji", ["❤️"]]]);
    expect(ops[1].row.emoji).toBe("😂");
    const mine = mocks.shell.props.reactionsByMessageId[5].filter((r) => r.profile_id === ME);
    expect(mine.map((r) => r.emoji)).toEqual(["😂"]);
  });

  it("retoucher la même réaction la retire (DELETE seul)", async () => {
    await mountAndOpenChat();
    await act(async () => { await mocks.shell.props.toggleReaction(msg, "👍"); });
    mocks.log.length = 0;
    await act(async () => { await mocks.shell.props.toggleReaction(msg, "👍"); });
    expect(mocks.log.filter((l) => l.table === "message_reactions").map((o) => o.op)).toEqual(["delete"]);
    expect(mocks.shell.props.reactionsByMessageId[5]).toEqual([]);
  });
});

describe("App — transfert de messages", () => {
  const KEY2 = keyWith(OTHER2);
  it("texte : INSERT dans la conversation de destination, marqué « forwarded »", async () => {
    await mountAndOpenChat();
    let result;
    await act(async () => { result = await mocks.shell.props.forwardMessages(OTHER2_PROFILE, [{ id: 1, kind: "text", text: "Salut" }]); });
    expect(result).toEqual({ sent: 1, failed: 0 });
    const ins = mocks.log.find((l) => l.table === "messages" && l.op === "insert");
    expect(ins.row).toMatchObject({ match_key: KEY2, from_id: ME, kind: "text", text: "Salut", media_path: null, media_meta: { forwarded: true } });
  });

  it("média : copie Storage vers le dossier du destinataire, puis INSERT ; métadonnées (dimensions…) conservées", async () => {
    await mountAndOpenChat();
    const src = { id: 2, kind: "image", media_path: `${KEY}/123-abc.jpg`, media_meta: { width: 800, height: 600, original_name: "a.jpg" } };
    await act(async () => { await mocks.shell.props.forwardMessages(OTHER2_PROFILE, [src]); });
    expect(mocks.storage.copy).toHaveBeenCalledTimes(1);
    const [from, to] = mocks.storage.copy.mock.calls[0];
    expect(from).toBe(src.media_path);
    expect(to.startsWith(`${KEY2}/`)).toBe(true);
    expect(to.endsWith(".jpg")).toBe(true);
    const ins = mocks.log.find((l) => l.table === "messages" && l.op === "insert");
    expect(ins.row.media_path).toBe(to);
    expect(ins.row.media_meta).toMatchObject({ width: 800, height: 600, forwarded: true });
  });

  it("copie refusée (RLS Storage) : aucun message créé, échec compté, erreur affichée", async () => {
    await mountAndOpenChat();
    mocks.storage.copy = vi.fn(async () => ({ data: null, error: { message: "denied", statusCode: "403" } }));
    let result;
    await act(async () => { result = await mocks.shell.props.forwardMessages(OTHER2_PROFILE, [{ id: 2, kind: "audio", media_path: `${KEY}/x.m4a`, media_meta: {} }]); });
    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mocks.log.some((l) => l.table === "messages" && l.op === "insert")).toBe(false);
  });

  it("fichier copié mais message refusé : le fichier copié est supprimé (pas d'orphelin)", async () => {
    await mountAndOpenChat();
    mocks.db.insertError = { message: "violates row-level security", code: "42501" };
    let result;
    await act(async () => { result = await mocks.shell.props.forwardMessages(OTHER2_PROFILE, [{ id: 3, kind: "video", media_path: `${KEY}/v.mp4`, media_meta: {} }]); });
    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mocks.storage.remove).toHaveBeenCalledTimes(1);
    expect(mocks.storage.remove.mock.calls[0][0][0].startsWith(`${KEY2}/`)).toBe(true);
  });

  it("ignore les messages supprimés et les cartes d'événement ; plafonne à 10", async () => {
    await mountAndOpenChat();
    const many = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, kind: "text", text: `m${i}` }));
    let result;
    await act(async () => { result = await mocks.shell.props.forwardMessages(OTHER2_PROFILE, [{ id: 90, kind: "text", text: "x", deleted_at: "2026-01-01" }, { id: 91, kind: "event", media_meta: {} }, ...many]); });
    expect(result.sent).toBe(10);
  });
});

describe("App — vocal : métadonnées", () => {
  it("durée et forme d'onde sont enregistrées dans media_meta avec le nom/type/taille du fichier", async () => {
    await mountAndOpenChat();
    const file = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], "voice-1.webm", { type: "audio/webm" });
    const waveform = Array.from({ length: 40 }, (_, i) => 10 + i);
    await act(async () => { await mocks.shell.props.sendMediaMessage(file, "audio", undefined, { duration: 7.4, waveform }); });
    const ins = mocks.log.find((l) => l.table === "messages" && l.op === "insert");
    expect(ins.row.kind).toBe("audio");
    expect(ins.row.media_meta).toMatchObject({ duration: 7.4, waveform, original_name: "voice-1.webm", mime: "audio/webm" });
  });

  it("un « Réessayer » après échec conserve durée et forme d'onde", async () => {
    await mountAndOpenChat();
    const file = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], "voice-2.webm", { type: "audio/webm" });
    mocks.db.insertError = { message: "boom", code: "XX000" };
    await act(async () => { await mocks.shell.props.sendMediaMessage(file, "audio", undefined, { duration: 3, waveform: [1, 2, 3, 4, 5] }); });
    await waitFor(() => expect(mocks.shell.props.messages.at(-1)?._status).toBe("failed"));
    mocks.db.insertError = null;
    mocks.log.length = 0;
    const failed = mocks.shell.props.messages.at(-1);
    await act(async () => { await mocks.shell.props.retrySend(failed); });
    const ins = mocks.log.find((l) => l.table === "messages" && l.op === "insert");
    expect(ins.row.media_meta).toMatchObject({ duration: 3, waveform: [1, 2, 3, 4, 5] });
  });
});
