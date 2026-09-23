import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Test d'intégration réelle du correctif "double-clic sur Supprimer un
// commentaire en modération" (CommunitiesTab.jsx/CommunityPostCard.jsx).
// Contexte : un modérateur/admin peut supprimer le commentaire d'un AUTRE
// membre (policy RLS "Auteur ou moderateur supprime un commentaire",
// supabase-communities.sql, is_community_mod). Avant ce correctif,
// handleDeleteComment n'avait aucune garde anti-double-appel — contrairement
// à handleRemoveMember/handleSetMemberRole (même fichier), qui en ont déjà
// une pour exactement la même raison : un second DELETE sur une ligne déjà
// supprimée ne renvoie pas d'erreur PostgREST, donc il "réussit" aussi et
// décrémente une deuxième fois postCommentCounts pour un seul commentaire
// réellement supprimé.
//
// Le bouton "Supprimer" de la ConfirmModal ne protège pas ce cas : son
// onConfirm (CommunityPostCard.jsx) déclenche onDeleteComment sans attendre
// sa promesse puis referme aussitôt la modale — l'état "confirming" de
// ConfirmModal ne couvre donc pas la durée réelle de l'appel réseau. Tant que
// celui-ci n'est pas résolu, le commentaire reste affiché avec son bouton
// "Supprimer ce commentaire" actif : un modérateur qui reclique dessus
// pendant que la première suppression est encore en vol relance
// handleDeleteComment une seconde fois pour le même commentaire.
//
// Ce test monte le VRAI CommunitiesTab (pas une réimplémentation) en tant que
// modérateur consultant une publication d'un AUTRE membre, ouvre les
// commentaires, confirme la suppression du commentaire une première fois
// (requête réseau maintenue en vol), reclique "Supprimer ce commentaire" +
// confirme une seconde fois pendant que la première est toujours en vol, puis
// vérifie qu'un seul DELETE est réellement parti vers community_comments.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function makeCommunityBuilder(community) {
  const builder = {};
  ["select", "eq", "or", "ilike", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => Promise.resolve({ data: community, error: null }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
  return builder;
}

function makeMembersBuilder(role) {
  const builder = {};
  ["select", "eq", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { role }, error: null }));
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [{ community_id: "c1", role }], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

// Builder dédié à community_comments : distingue la requête "compteur"
// (select("post_id").in(...), utilisée par loadPosts) de la requête
// "contenu" (select("*, profiles(...)").eq(...).order(...), utilisée par
// handleLoadComments) selon les colonnes demandées, et rend le DELETE
// contrôlable (une promesse par appel, résolue manuellement par le test) pour
// pouvoir observer précisément combien d'appels réseau réels partent.
function makeCommentsBuilder({ comment, deleteCalls }) {
  const builder = {};
  let mode = "counts";
  builder.select = vi.fn((cols) => {
    mode = String(cols).includes("profiles") ? "withProfiles" : "counts";
    return builder;
  });
  ["eq", "in", "order"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) => {
    const data = mode === "withProfiles" ? [comment] : [{ post_id: comment.post_id }];
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  builder.delete = vi.fn(() => {
    const delBuilder = {};
    delBuilder.eq = vi.fn(() => {
      let resolveFn;
      const promise = new Promise((res) => { resolveFn = res; });
      deleteCalls.push(resolveFn);
      return { then: (resolve, reject) => promise.then(resolve, reject) };
    });
    return delBuilder;
  });
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

describe("CommunitiesTab — modération : garde anti-double-clic sur la suppression d'un commentaire", () => {
  let deleteCalls;

  beforeEach(() => {
    vi.clearAllMocks();
    deleteCalls = [];

    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: null,
    };
    const comment = {
      id: "cmt1", post_id: "p1", author_id: "author1", body: "Commentaire à modérer",
      created_at: new Date().toISOString(), profiles: { name: "Auteur" },
    };
    const post = {
      id: "p1", community_id: "c1", author_id: "author1", body: "Publication à modérer",
      created_at: new Date().toISOString(), profiles: { name: "Auteur" },
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder("moderator");
      if (table === "community_posts") return makeQueryBuilder({ data: [post], error: null });
      if (table === "community_comments") return makeCommentsBuilder({ comment, deleteCalls });
      return makeQueryBuilder();
    });
  });

  it("un second \"Supprimer\" pendant que la première suppression est en vol ne déclenche pas un second DELETE", async () => {
    const user = userEvent.setup();
    render(
      <CommunitiesTab
        currentUser={{ id: "mod1", name: "Modérateur" }}
        onError={vi.fn()}
        initialCommunityId="c1"
      />
    );

    await screen.findByText("Publication à modérer");

    const toggleComments = await screen.findByRole("button", { name: "Afficher les commentaires" });
    await user.click(toggleComments);

    await screen.findByText("Commentaire à modérer");

    // Premier clic confirmé : lance handleDeleteComment, le DELETE reste en
    // vol (non résolu) donc le commentaire est toujours affiché ensuite.
    await user.click(screen.getByRole("button", { name: "Supprimer ce commentaire" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(deleteCalls.length).toBe(1));

    // Le commentaire est toujours affiché (le premier DELETE n'a pas encore
    // répondu) avec son bouton de suppression toujours actif.
    expect(screen.getByText("Commentaire à modérer")).toBeInTheDocument();

    // Second clic confirmé (double-clic/tap rapide) sur le MÊME commentaire
    // pendant que la première suppression est encore en vol : ne doit PAS
    // déclencher un second DELETE réseau.
    await user.click(screen.getByRole("button", { name: "Supprimer ce commentaire" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));
    expect(deleteCalls.length).toBe(1); // toujours 1, pas 2

    // Résout le DELETE en vol : le commentaire disparaît normalement.
    deleteCalls[0]({ error: null });
    await waitFor(() => expect(screen.queryByText("Commentaire à modérer")).not.toBeInTheDocument());

    // Toujours un seul DELETE parti au total malgré les deux confirmations.
    expect(deleteCalls.length).toBe(1);
  });
});
