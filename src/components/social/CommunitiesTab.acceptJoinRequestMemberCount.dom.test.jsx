import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit du compteur de membres (angle "exactitude en usage
// concurrent", jamais audité jusqu'ici pour ce chemin précis) : accept_join_request
// (supabase-communities.sql) insère la ligne community_members avec
// "on conflict (community_id, profile_id) do nothing" — exactement le même
// motif qu'accept_invite (déjà corrigé, voir CommunitiesTab.
// acceptInviteMemberCount.dom.test.jsx et refreshMemberCount ci-dessus dans
// CommunitiesTab.jsx). La fonction RPC réussit donc SANS ajouter de membre si
// le ou la demandeur·se est déjà membre au moment où le staff clique
// "Accepter" (ex. une invitation à cette même communauté, acceptée en
// parallèle pendant que cette demande restait encore affichée comme "en
// attente" dans l'onglet Gestion — non temps réel, voir
// CommunitiesTab.joinRequestAlreadyDecided.dom.test.jsx pour le même constat
// côté "double traitement"). handleAcceptRequest appelait jusqu'ici
// adjustMemberCount(req.community_id, 1) sans condition : un pur +1
// optimiste côté client, sans aucune relecture de la base, qui gonflait
// durablement de 1 le compteur de membres affiché dans la liste des
// communautés dans ce scénario précis. Ce test vérifie qu'accepter une
// demande d'adhésion relit désormais le compteur réel depuis la base
// (comme accept_invite le fait déjà), au lieu d'incrémenter aveuglément en
// local.

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

// Table "communities" : trace chaque appel à .select() pour distinguer la
// simple lecture de la communauté (goDetail, select("*")) de la relecture du
// compteur réel (refreshMemberCount, select("*, community_members(count)")) —
// seule cette dernière doit survenir après l'acceptation.
function makeCommunitiesBuilder(community, selectCalls) {
  const builder = {};
  builder.select = vi.fn((arg) => { selectCalls.push(arg); return builder; });
  ["eq", "or", "ilike", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  // community_members = [{ count: 3 }] : compte réel, déjà à jour côté
  // serveur (la demande n'a en réalité rien ajouté, voir scénario ci-dessus).
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

describe("CommunitiesTab — accepter une demande d'adhésion déjà membre ne gonfle pas le compteur", () => {
  let selectCalls;

  beforeEach(() => {
    vi.clearAllMocks();
    selectCalls = [];

    const community = {
      id: "c1", name: "Communauté Privée Test", visibility: "private", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: null,
      created_at: new Date().toISOString(),
      community_members: [{ count: 3 }], // compte réel, déjà à jour côté serveur
    };
    const joinRequest = {
      id: "jr1", community_id: "c1", profile_id: "applicant1", status: "pending",
      created_at: new Date().toISOString(),
      profiles: { name: "Candidat", avatar_url: null },
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunitiesBuilder(community, selectCalls);
      if (table === "community_members") return makeMembersBuilder("admin");
      if (table === "community_join_requests") return makeQueryBuilder({ data: [joinRequest], error: null });
      return makeQueryBuilder();
    });
    // accept_join_request : succès, mais no-op côté insertion (déjà membre).
    mocks.rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it("relit le compteur réel depuis la base plutôt que de l'incrémenter aveuglément en local", async () => {
    const user = userEvent.setup();
    render(
      <CommunitiesTab
        currentUser={{ id: "admin1", name: "Admin" }}
        onError={vi.fn()}
        initialCommunityId="c1"
        blockedIds={new Set()}
      />
    );

    await screen.findByRole("button", { name: "Gestion" });
    await user.click(screen.getByRole("button", { name: "Gestion" }));

    await screen.findByText("Candidat");

    // Avant l'acceptation : seule la lecture simple de la communauté
    // (select("*") par goDetail) a eu lieu, jamais la relecture du compteur.
    expect(selectCalls.some((s) => typeof s === "string" && s.includes("community_members(count)"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Accepter la demande" }));

    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("accept_join_request", { p_request_id: "jr1" }));
    await screen.findByText("Aucune demande en attente.");

    // Après l'acceptation : refreshMemberCount a bien relu le compteur réel
    // depuis la base (même mécanisme que handleAcceptInvite), au lieu d'un
    // +1 optimiste qui n'aurait déclenché aucun nouvel appel réseau.
    await waitFor(() =>
      expect(selectCalls.some((s) => typeof s === "string" && s.includes("community_members(count)"))).toBe(true)
    );
  });
});
