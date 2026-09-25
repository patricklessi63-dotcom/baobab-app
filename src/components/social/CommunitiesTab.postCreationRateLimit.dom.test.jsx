import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit (même motif que addStory()/SocialShell.jsx, commit
// 57ff5ea, et PostsFeed.jsx pour le fil général) :
// check_community_post_creation_rate_limit()
// (supabase-content-creation-limits-fix.sql, plafond 50 publications/24h)
// rejette l'insertion dans "community_posts" avec un message déjà propre en
// français ("Trop de publications creees recemment, reessaie plus tard",
// erreur Postgres P0001) — mais handleSubmitPost() (CommunitiesTab.jsx)
// l'ignorait et affichait toujours le même message générique fixe
// "Impossible de publier. Réessaie.".

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

// Reproduit exactement la chaîne .insert(...).select(...).single() de
// handleSubmitPost() pour la table "community_posts", en rejetant avec la
// même forme d'erreur qu'un raise exception Postgres (P0001 + message déjà
// en français). Le chargement initial de la liste (loadPosts, select simple)
// passe par le "then" générique ci-dessous.
function makeCommunityPostsBuilder() {
  const builder = makeQueryBuilder({ data: [], error: null, count: 0 });
  builder.insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: "P0001", message: "Trop de publications creees recemment, reessaie plus tard" },
        })
      ),
    })),
  }));
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

describe("CommunitiesTab — handleSubmitPost() affiche le vrai message serveur en cas de rejet (limite de débit)", () => {
  let onError;

  beforeEach(() => {
    vi.clearAllMocks();
    onError = vi.fn();

    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: null,
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder("member");
      if (table === "community_posts") return makeCommunityPostsBuilder();
      return makeQueryBuilder();
    });
  });

  it("affiche le message précis du trigger plutôt que le message générique 'Réessaie'", async () => {
    const user = userEvent.setup();
    render(
      <CommunitiesTab
        currentUser={{ id: "u1", name: "Moi" }}
        onError={onError}
        initialCommunityId="c1"
      />
    );

    const textarea = await screen.findByPlaceholderText("Qui va au match samedi ?");
    await user.type(textarea, "Un nouveau post");
    await user.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith("Trop de publications creees recemment, reessaie plus tard");
    expect(onError).not.toHaveBeenCalledWith("Impossible de publier. Réessaie.");
  });
});
