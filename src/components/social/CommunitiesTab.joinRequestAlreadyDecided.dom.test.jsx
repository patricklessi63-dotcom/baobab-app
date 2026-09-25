import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit du flux "demande d'adhésion" (angle "deux membres
// du staff traitent la même demande en même temps", jamais audité jusqu'ici
// — aucun canal Realtime n'existe sur community_join_requests). Scénario :
// un second membre du staff, resté sur l'écran "Gestion", clique
// "Accepter" sur une demande qu'un collègue vient d'accepter/refuser depuis
// un autre onglet/session. accept_join_request/reject_join_request
// (supabase-communities.sql) verrouillent la ligne et vérifient
// status = 'pending' avant d'agir : le second appel échoue proprement côté
// base avec "Demande introuvable ou deja traitee" (aucun double traitement),
// mais CommunitiesTab affichait jusqu'ici un message d'échec générique
// ("Impossible d'accepter cette demande.") et laissait la ligne dans la
// liste, cliquable indéfiniment. Ce test monte le VRAI CommunitiesTab,
// simule ce rejet RPC précis, et vérifie que la demande disparaît de la
// liste avec un message qui correspond à la réalité ("déjà été traitée").

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

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

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

describe("CommunitiesTab — demande d'adhésion déjà traitée par un autre membre du staff", () => {
  let onError;

  beforeEach(() => {
    vi.clearAllMocks();
    onError = vi.fn();

    const community = {
      id: "c1", name: "Communauté Privée Test", visibility: "private", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: null,
    };
    const joinRequest = {
      id: "jr1", community_id: "c1", profile_id: "applicant1", status: "pending",
      created_at: new Date().toISOString(),
      profiles: { name: "Candidat", avatar_url: null },
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder("admin");
      if (table === "community_join_requests") return makeQueryBuilder({ data: [joinRequest], error: null });
      return makeQueryBuilder();
    });

    // Simule exactement le rejet renvoyé par accept_join_request()
    // (supabase-communities.sql) quand la ligne n'est plus "pending".
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Demande introuvable ou deja traitee", code: "P0001" },
    });
  });

  it("retire la demande de la liste et affiche un message exact plutôt qu'un échec générique", async () => {
    const user = userEvent.setup();
    render(
      <CommunitiesTab
        currentUser={{ id: "admin1", name: "Admin" }}
        onError={onError}
        initialCommunityId="c1"
        blockedIds={new Set()}
      />
    );

    await screen.findByRole("button", { name: "Gestion" });
    await user.click(screen.getByRole("button", { name: "Gestion" }));

    await screen.findByText("Candidat");
    await user.click(screen.getByRole("button", { name: "Accepter la demande" }));

    await screen.findByText("Aucune demande en attente.");
    expect(screen.queryByText("Candidat")).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(
      "Cette demande a déjà été traitée (par toi ou un autre membre du staff) entre-temps."
    );
    expect(onError).not.toHaveBeenCalledWith("Impossible d'accepter cette demande.");
  });
});
