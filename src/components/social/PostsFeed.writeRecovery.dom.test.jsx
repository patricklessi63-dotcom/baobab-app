import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit réseau (6 oct. 2026) : posts, commentaires et lignes post_media sont
// insérés sans clé d'idempotence (uuid généré par la base). Une coupure PENDANT
// l'INSERT laisse l'issue incertaine ; sans vérification, un second clic sur
// « Publier » / « Envoyer » créait un doublon visible de tous, et une photo dont
// l'insertion avait réussi voyait son fichier supprimé (photo cassée).

const mocks = vi.hoisted(() => ({ db: null, removeSpy: vi.fn(() => Promise.resolve({})) }));

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));
vi.mock("../../lib/uploadWithProgress", () => ({ uploadWithProgress: () => Promise.resolve() }));

const netErr = { message: "TypeError: Failed to fetch", code: "" };

function makeBuilder(table) {
  const ctx = { table, op: "select", row: null, filters: [] };
  const b = {};
  ["select", "neq", "lt", "lte", "gte", "order", "range", "limit", "is", "ilike", "or", "match", "contains", "not"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.eq = vi.fn((c, v) => { ctx.filters.push((r) => r[c] === v); return b; });
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
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: (...a) => mocks.removeSpy(...a), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.test/post-media/x.mp4" } })) })) },
  },
}));

import PostsFeed from "./PostsFeed";

function makeDb() {
  const state = {
    posts: [], post_media: [], post_comments: [],
    insertMode: "ok", // ok | lost-response | never-sent
    readsFail: false,
    mediaInsertMode: "ok",
    insertCalls: { posts: 0, post_media: 0, post_comments: 0 },
    seq: 1,
    resolve(ctx, single) {
      const { table } = ctx;
      if (ctx.op === "insert") {
        state.insertCalls[table] = (state.insertCalls[table] || 0) + 1;
        const mode = table === "post_media" ? state.mediaInsertMode : state.insertMode;
        const persist = () => {
          const saved = { id: `${table}-${state.seq++}`, created_at: new Date().toISOString(), profiles: { name: "Moi" }, ...ctx.row };
          state[table].push(saved);
          return saved;
        };
        if (mode === "ok") return { data: persist(), error: null };
        if (mode === "lost-response") { persist(); return { data: null, error: netErr }; }
        return { data: null, error: netErr };
      }
      if (!state[table]) return { data: single ? null : [], error: null };
      // lecture ciblée de rattrapage (recherche d'un doublon / d'une ligne post_media)
      const hasIdentityFilter = ctx.filters.length > 0;
      if (state.readsFail && hasIdentityFilter) return { data: null, error: netErr };
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

async function openComposerAndType(user, text) {
  await user.click(await screen.findByText("Partage quelque chose avec la communauté..."));
  const textarea = await screen.findByPlaceholderText("Écris ton message...");
  await user.type(textarea, text);
}

describe("PostsFeed — publication coupée en plein vol", () => {
  it("INSERT exécuté mais réponse perdue : la publication est reconnue (pas d'erreur, une seule ligne)", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={{ id: "u1", user_id: "a1", name: "Moi" }} onError={onError} />); });
    mocks.db.insertMode = "lost-response";
    await openComposerAndType(user, "Bonjour tout le monde");
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(mocks.db.posts).toHaveLength(1));
    await waitFor(() => expect(screen.queryByPlaceholderText("Écris ton message...")).toBeNull());
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.db.insertCalls.posts).toBe(1);
  });

  it("réseau toujours coupé après la réponse perdue : le second clic ne crée PAS de doublon une fois le réseau revenu", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={{ id: "u1", user_id: "a1", name: "Moi" }} onError={onError} />); });
    mocks.db.insertMode = "lost-response";
    mocks.db.readsFail = true;
    await openComposerAndType(user, "Bonjour tout le monde");
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mocks.db.posts).toHaveLength(1); // déjà créée côté serveur

    // Le réseau revient ; la personne retape sur « Publier ».
    mocks.db.readsFail = false;
    mocks.db.insertMode = "ok";
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(screen.queryByPlaceholderText("Écris ton message...")).toBeNull());
    expect(mocks.db.posts).toHaveLength(1);
    expect(mocks.db.insertCalls.posts).toBe(1);
  });

  it("requête jamais partie : le second clic publie normalement (une seule ligne)", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={{ id: "u1", user_id: "a1", name: "Moi" }} onError={onError} />); });
    mocks.db.insertMode = "never-sent";
    mocks.db.readsFail = true;
    await openComposerAndType(user, "Bonjour tout le monde");
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    mocks.db.readsFail = false;
    mocks.db.insertMode = "ok";
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(mocks.db.posts).toHaveLength(1));
  });
});

describe("PostsFeed — média de publication : insertion post_media coupée en plein vol", () => {
  it("ligne créée mais réponse perdue : la vidéo est reconnue attachée et son fichier N'est PAS supprimé", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    let container;
    await act(async () => { ({ container } = render(<PostsFeed currentUser={{ id: "u1", user_id: "a1", name: "Moi" }} onError={onError} />)); });
    mocks.db.mediaInsertMode = "lost-response";
    await openComposerAndType(user, "Avec une vidéo");
    const videoInput = container.ownerDocument.querySelector('input[type="file"][accept*="video"]');
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    await act(async () => { fireEvent.change(videoInput, { target: { files: [file] } }); });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(mocks.db.post_media).toHaveLength(1));
    await waitFor(() => expect(screen.queryByPlaceholderText("Écris ton message...")).toBeNull());
    expect(mocks.removeSpy).not.toHaveBeenCalled(); // avant correctif : fichier supprimé, vidéo cassée
    expect(onError).not.toHaveBeenCalled(); // avant correctif : « 1 média n'a pas pu être envoyé »
    expect(mocks.db.insertCalls.post_media).toBe(1);
  });

  it("insertion post_media définitivement refusée : le fichier est bien nettoyé (pas d'orphelin)", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    let container;
    await act(async () => { ({ container } = render(<PostsFeed currentUser={{ id: "u1", user_id: "a1", name: "Moi" }} onError={onError} />)); });
    mocks.db.mediaInsertMode = "never-sent";
    await openComposerAndType(user, "Avec une vidéo");
    const videoInput = container.ownerDocument.querySelector('input[type="file"][accept*="video"]');
    await act(async () => { fireEvent.change(videoInput, { target: { files: [new File(["x"], "clip.mp4", { type: "video/mp4" })] } }); });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Publier" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mocks.removeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("PostsFeed — commentaire coupé en plein vol", () => {
  async function renderWithOnePost() {
    mocks.db.posts = [{ id: "p1", author_id: "u2", body: "Un post", created_at: new Date().toISOString(), profiles: { name: "Awa" } }];
    const onError = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={{ id: "u1", user_id: "a1", name: "Moi" }} onError={onError} />); });
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("Afficher les commentaires"));
    const input = await screen.findByLabelText("Écrire un commentaire");
    return { user, onError, input };
  }

  it("réponse perdue mais commentaire créé : affiché une fois, aucune erreur", async () => {
    const { user, onError, input } = await renderWithOnePost();
    mocks.db.insertMode = "lost-response";
    await user.type(input, "Bienvenue");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByText("Bienvenue");
    expect(screen.getAllByText("Bienvenue")).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.db.post_comments).toHaveLength(1);
  });

  it("réseau coupé : le texte tapé est remis dans le champ, et le renvoi une fois le réseau revenu ne crée pas de doublon", async () => {
    const { user, onError, input } = await renderWithOnePost();
    mocks.db.insertMode = "lost-response";
    mocks.db.readsFail = true;
    await user.type(input, "Bienvenue");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    // Avant correctif : le champ était vidé sans retour possible.
    await waitFor(() => expect(screen.getByLabelText("Écrire un commentaire")).toHaveValue("Bienvenue"));
    expect(mocks.db.post_comments).toHaveLength(1);

    mocks.db.readsFail = false;
    mocks.db.insertMode = "ok";
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByLabelText("Écrire un commentaire")).toHaveValue(""));
    await screen.findByText("Bienvenue");
    expect(mocks.db.post_comments).toHaveLength(1);
    expect(mocks.db.insertCalls.post_comments).toBe(1);
  });
});
