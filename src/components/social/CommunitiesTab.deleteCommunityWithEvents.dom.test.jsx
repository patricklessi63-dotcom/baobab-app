import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit de la suppression de communauté (jamais auditée
// jusqu'ici — pendant "communauté entière" de la suppression d'événement).
// events.community_id est "on delete set null" (supabase-communities.sql),
// jamais "cascade" : un événement lié à la communauté ne devrait donc pas
// disparaître avec elle. Mais tout événement créé "pour une communauté" a
// forcément visibility = 'community' (EventCreateForm.jsx), et la contrainte
// CHECK events_community_visibility_consistent (supabase-events-v2.sql)
// exige justement community_id non nul dans ce cas. Résultat réel : dès que
// la communauté a au moins un événement (même annulé), le "SET NULL"
// déclenché par la suppression de la communauté viole cette contrainte et la
// suppression échoue ENTIÈREMENT côté base (code Postgres 23514) — mais
// handleDeleteCommunity affichait un message générique qui masquait la vraie
// cause. Ce test simule exactement ce rejet et vérifie le message clair.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not", "delete"].forEach((m) => {
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
  builder.delete = vi.fn(() => ({
    eq: vi.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          message: 'new row for relation "events" violates check constraint "events_community_visibility_consistent"',
          code: "23514",
        },
      })
    ),
  }));
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

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

describe("CommunitiesTab — suppression de communauté bloquée par un événement encore rattaché", () => {
  let onError;

  beforeEach(() => {
    vi.clearAllMocks();
    onError = vi.fn();

    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: "owner1",
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder("owner");
      return makeQueryBuilder();
    });
  });

  it("affiche un message clair au lieu de l'échec générique", async () => {
    const user = userEvent.setup();
    render(
      <CommunitiesTab
        currentUser={{ id: "owner1", name: "Propriétaire" }}
        onError={onError}
        initialCommunityId="c1"
        blockedIds={new Set()}
      />
    );

    await screen.findByRole("button", { name: /Supprimer la communauté/ });
    await user.click(screen.getByRole("button", { name: /Supprimer la communauté/ }));

    await screen.findByRole("button", { name: "Supprimer" });
    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith(
      "Impossible de supprimer cette communauté : au moins un événement (même annulé) lui est encore rattaché. Supprime d'abord ces événements avant de supprimer la communauté."
    );
    expect(onError).not.toHaveBeenCalledWith("Impossible de supprimer cette communauté.");
  });
});
