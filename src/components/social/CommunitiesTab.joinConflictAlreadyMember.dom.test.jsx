import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit (même famille que handlePass/handleLike dans
// App.jsx, contrainte unique(from_id,to_id) sur "likes"/"passes") : la table
// "community_members" a elle aussi une contrainte unique(community_id,
// profile_id) (supabase-communities.sql). Un utilisateur avec deux onglets/
// appareils ouverts sur le même compte (ou dont myMemberships n'a pas encore
// rattrapé une adhésion déjà actée côté serveur) peut cliquer "Rejoindre" sur
// une communauté publique dont il est déjà membre : l'INSERT remonte alors un
// conflit Postgres (23505). Avant le correctif, ce conflit était traité comme
// une vraie erreur ("Impossible de rejoindre cette communauté."), et
// myMemberships n'étant jamais mis à jour, le bouton "Rejoindre" restait
// affiché indéfiniment — un nouveau clic retombant sur la même erreur en
// boucle alors que l'adhésion est déjà bien réelle en base. Ce test monte le
// VRAI CommunitiesTab, simule ce conflit précis sur l'INSERT, et vérifie que
// l'interface bascule quand même sur l'état "déjà membre" sans message
// d'erreur générique.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), insertMock: vi.fn() }));

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

// "community_members" sert à la fois à : (1) charger les adhésions de
// l'utilisateur courant au montage (select), (2) charger la liste des
// membres de la communauté ouverte (select avec count), et (3) l'INSERT de
// handleJoin lui-même, simulé ici en conflit (23505).
function makeMembersBuilder() {
  const builder = {};
  ["select", "eq", "order", "limit", "in"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
  builder.insert = mocks.insertMock;
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

describe("CommunitiesTab — rejoindre une communauté publique déjà rejointe (conflit 23505)", () => {
  let onError;

  beforeEach(() => {
    vi.clearAllMocks();
    onError = vi.fn();

    const community = {
      id: "c1", name: "Communauté Publique Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: null,
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder();
      return makeQueryBuilder();
    });

    // Simule le conflit Postgres réel d'un INSERT sur community_members
    // (unique(community_id, profile_id)) quand cette personne est déjà
    // membre côté serveur.
    mocks.insertMock.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
  });

  it("bascule sur l'état déjà-membre sans message d'erreur générique, au lieu de rester bloqué sur \"Rejoindre\"", async () => {
    const user = userEvent.setup();
    render(
      <CommunitiesTab
        currentUser={{ id: "member1", name: "Membre" }}
        onError={onError}
        initialCommunityId="c1"
        blockedIds={new Set()}
      />
    );

    const joinButton = await screen.findByRole("button", { name: "Rejoindre" });
    await user.click(joinButton);

    await screen.findByRole("button", { name: "Quitter la communauté" });
    expect(screen.queryByRole("button", { name: "Rejoindre" })).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalledWith("Impossible de rejoindre cette communauté.");
  });
});
