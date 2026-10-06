import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit de régression (6 oct. 2026) — CHEMIN NORMAL (réseau OK) de la publication
// et du commentaire après le lot « robustesse réseau » : aucune lecture de
// rattrapage superflue, aucune « adoption » erronée d'une ligne identique voulue
// (même texte publié/commenté deux fois volontairement), champ vidé après succès.

const mocks = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));
vi.mock("../../lib/uploadWithProgress", () => ({ uploadWithProgress: () => Promise.resolve() }));

const netErr = { message: "TypeError: Failed to fetch", code: "" };

function makeBuilder(table) {
  const ctx = { table, op: "select", row: null, filters: [], cols: [] };
  const b = {};
  ["select", "neq", "lt", "lte", "gte", "order", "range", "limit", "is", "ilike", "or", "match", "contains", "not"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.eq = vi.fn((c, v) => { ctx.cols.push(c); ctx.filters.push((r) => r[c] === v); return b; });
  b.gt = vi.fn((c, v) => { ctx.filters.push((r) => r[c] > v); return b; });
  b.in = vi.fn((c, vals) => { ctx.filters.push((r) => vals.includes(r[c])); return b; });
  b.insert = vi.fn((row) => { ctx.op = "insert"; ctx.row = row; return b; });
  b.single = vi.fn(() => Promise.resolve(mocks.db.resolve(ctx, true)));
  b.maybeSingle = vi.fn(() => Promise.resolve(mocks.db.resolve(ctx, true)));
  b.then = (resolve, reject) => Promise.resolve(mocks.db.resolve(ctx, false)).then(resolve, reject);
  return b;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn((table) => makeBuilder(table)),
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(() => Promise.resolve({})), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.test/x" } })) })) },
  },
}));

import PostsFeed from "./PostsFeed";

function makeDb() {
  const state = {
    posts: [], post_media: [], post_comments: [],
    insertMode: "ok", // ok | never-sent | rls
    identityReads: 0, // lectures ciblées (filtre d'égalité) = sondes de rattrapage
    insertCalls: { posts: 0, post_comments: 0 },
    seq: 1,
    resolve(ctx, single) {
      const { table } = ctx;
      if (ctx.op === "insert") {
        state.insertCalls[table] = (state.insertCalls[table] || 0) + 1;
        const persist = () => {
          const saved = { id: `${table}-${state.seq++}`, created_at: new Date().toISOString(), profiles: { name: "Moi" }, ...ctx.row };
          state[table].push(saved);
          return saved;
        };
        if (state.insertMode === "ok") return { data: persist(), error: null };
        if (state.insertMode === "rls") return { data: null, error: { message: "new row violates row-level security policy", code: "42501" } };
        return { data: null, error: netErr };
      }
      if (!state[table]) return { data: single ? null : [], error: null };
      if (ctx.filters.length > 0 && (table === "posts" || table === "post_comments")) {
        // les chargements normaux du fil n'ont pas de filtre d'égalité sur body
        const probesBody = ctx.cols.includes("body");
        if (probesBody) state.identityReads += 1;
      }
      const rows = state[table].filter((r) => ctx.filters.every((f) => f(r)));
      if (single) return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    },
  };
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db = makeDb();
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

const ME = { id: "u1", user_id: "a1", name: "Moi" };

async function publish(user, text) {
  await user.click(await screen.findByText("Partage quelque chose avec la communauté..."));
  const textarea = await screen.findByPlaceholderText("Écris ton message...");
  await user.type(textarea, text);
  await user.click(screen.getByRole("button", { name: "Publier" }));
}

describe("PostsFeed — publication, chemin normal", () => {
  it("même texte publié deux fois volontairement : deux lignes, aucune lecture de rattrapage", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={onError} />); });
    await publish(user, "Bonjour");
    await waitFor(() => expect(mocks.db.posts).toHaveLength(1));
    await waitFor(() => expect(screen.queryByPlaceholderText("Écris ton message...")).toBeNull());
    await publish(user, "Bonjour");
    await waitFor(() => expect(mocks.db.posts).toHaveLength(2));
    expect(mocks.db.insertCalls.posts).toBe(2);
    expect(mocks.db.identityReads).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("échec DÉFINITIF (RLS, code présent) puis même texte : pas de sonde, publication normale", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={onError} />); });
    mocks.db.insertMode = "rls";
    await publish(user, "Bonjour");
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mocks.db.identityReads).toBe(0); // une erreur avec code n'est jamais « incertaine »
    mocks.db.insertMode = "ok";
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(mocks.db.posts).toHaveLength(1));
  });

  it("échec incertain d'un texte puis publication d'un AUTRE texte : insérée normalement (aucune adoption)", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={onError} />); });
    // Une ancienne publication identique existe déjà (connue du fil) : jamais adoptée.
    mocks.db.insertMode = "never-sent";
    await publish(user, "Salut");
    await waitFor(() => expect(onError).toHaveBeenCalled());
    mocks.db.insertMode = "ok";
    const textarea = screen.getByPlaceholderText("Écris ton message...");
    await user.clear(textarea);
    await user.type(textarea, "Tout autre message");
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(mocks.db.posts).toHaveLength(1));
    expect(mocks.db.posts[0].body).toBe("Tout autre message");
  });
});

describe("PostsFeed — commentaire, chemin normal", () => {
  async function renderWithOnePost() {
    mocks.db.posts = [{ id: "p1", author_id: "u2", body: "Un post", created_at: new Date().toISOString(), profiles: { name: "Awa" } }];
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={onError} />); });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("Afficher les commentaires"));
    const input = await screen.findByLabelText("Écrire un commentaire");
    return { user, onError, input };
  }

  it("même commentaire envoyé deux fois volontairement : deux lignes, champ vidé à chaque fois, aucune sonde", async () => {
    const { user, onError, input } = await renderWithOnePost();
    await user.type(input, "Merci");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(mocks.db.post_comments).toHaveLength(1));
    await waitFor(() => expect(screen.getByLabelText("Écrire un commentaire")).toHaveValue(""));
    await user.type(screen.getByLabelText("Écrire un commentaire"), "Merci");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(mocks.db.post_comments).toHaveLength(2));
    await waitFor(() => expect(screen.getByLabelText("Écrire un commentaire")).toHaveValue(""));
    expect(screen.getAllByText("Merci")).toHaveLength(2);
    expect(mocks.db.identityReads).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });
});
