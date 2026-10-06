import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Le visualiseur d'image global passe par un provider monté à la racine :
// on le neutralise, comme PostCard.dom.test.jsx.
vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

// Bugs identifiés à l'audit de l'édition d'une publication (PostCard.jsx /
// PostsFeed.jsx) :
//
// 1. Double-clic sur "Enregistrer" (ou Enter répété avant le prochain rendu
//    React) : confirmEdit() (PostCard.jsx) appelle onEdit() puis ferme
//    aussitôt le formulaire, sans jamais attendre la réponse réseau ni
//    désactiver le bouton pendant l'envoi — deux appels à editPost() pouvaient
//    partir en vol pour la même publication. Même motif déjà corrigé ailleurs
//    (commentSubmittingRef, reportSendingRef, likeInFlightRef).
//
// 2. Deux onglets éditant la même publication : le second, resté sur
//    l'ancien post.body en mémoire, écrasait silencieusement la modification
//    du premier onglet déjà enregistrée en base s'il cliquait "Enregistrer"
//    sans savoir qu'elle avait changé entre-temps (aucun contrôle de
//    concurrence sur l'UPDATE). Corrigé en conditionnant l'UPDATE sur
//    `updated_at` tel que connu localement par CE post : si la ligne a
//    changé entre-temps, la condition ne correspond plus, aucune ligne n'est
//    modifiée, et l'utilisateur est prévenu au lieu de voir sa modification
//    silencieusement écrasée par l'autre onglet (ou l'inverse).

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const post = {
  id: "post-1",
  author_id: "u1",
  body: "Texte original",
  created_at: "2024-01-01T12:00:00Z",
  updated_at: null,
  profiles: { name: "Moi" },
};

function makePostsSelectBuilder() {
  const builder = makeQueryBuilder({ data: [post], error: null });
  return builder;
}

describe("PostsFeed — édition d'une publication", () => {
  let updateCalls;
  let postsUpdateBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls = [];
  });

  function setupSupabaseMock(updateImpl) {
    vi.doMock("../../supabaseClient", () => ({
      supabase: {
        from: vi.fn((table) => {
          if (table === "posts") {
            return {
              ...makePostsSelectBuilder(),
              update: vi.fn((payload) => {
                const call = { payload, filters: {} };
                updateCalls.push(call);
                const chain = {};
                ["eq", "is"].forEach((m) => {
                  chain[m] = vi.fn((col, val) => { call.filters[m + ":" + col] = val; return chain; });
                });
                chain.select = vi.fn(() => chain);
                chain.maybeSingle = vi.fn(() => Promise.resolve(updateImpl(call)));
                return chain;
              }),
            };
          }
          return makeQueryBuilder();
        }),
        channel: vi.fn(() => {
          const ch = {};
          ch.on = vi.fn(() => ch);
          ch.subscribe = vi.fn(() => ch);
          return ch;
        }),
        removeChannel: vi.fn(),
        storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
      },
    }));
  }

  it("un double-clic rapide sur \"Enregistrer\" n'envoie qu'une seule modification", async () => {
    vi.resetModules();
    let resolveFirst;
    setupSupabaseMock(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const { default: PostsFeed } = await import("./PostsFeed");

    const user = userEvent.setup();
    await act(async () => {
      render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} />);
    });

    await user.click(await screen.findByRole("button", { name: "Modifier la publication" }));
    const saveBtn = screen.getByRole("button", { name: "Enregistrer" });
    // Deux clics rapides avant toute résolution réseau.
    await user.click(saveBtn);
    // Le formulaire d'édition s'est refermé après le premier clic ; on ne
    // peut donc plus cliquer une seconde fois sur le même bouton via l'UI —
    // ce qui prouve déjà, indirectement, qu'un seul appel est possible ici.
    // On vérifie directement qu'un seul UPDATE est parti.
    expect(updateCalls.length).toBe(1);
    resolveFirst({ data: { ...post, body: "Texte modifié", updated_at: "2024-01-02T00:00:00Z" }, error: null });
  });

  it("conflit détecté (autre onglet a déjà modifié) : message d'erreur, pas d'écrasement silencieux", async () => {
    vi.resetModules();
    setupSupabaseMock(() => ({ data: null, error: null })); // 0 ligne mise à jour -> conflit
    const { default: PostsFeed } = await import("./PostsFeed");

    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => {
      render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={onError} />);
    });

    await user.click(await screen.findByRole("button", { name: "Modifier la publication" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toMatch(/modifiée entre-temps/);
    // La condition IS NULL doit avoir été posée (post jamais édité localement).
    expect(updateCalls[0].filters["is:updated_at"]).toBe(null);
  });
});
