import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit du flux "demande d'adhésion" (jamais audité
// jusqu'ici) : contrairement à posts/membres/commentaires — déjà filtrés par
// blockedIds au rendu dans ce même fichier (CommunitiesTab.jsx) — la liste
// des demandes d'adhésion en attente passée à CommunityAdminPanel ne
// l'était pas. Un profil qui a bloqué un membre du staff (ou que ce membre a
// bloqué) pouvait donc demander à rejoindre une communauté privée et
// apparaître normalement dans la file d'approbation de ce staff, à un clic
// d'être accepté — une mise en contact malgré le blocage. Ce test monte le
// VRAI CommunitiesTab en tant qu'admin d'une communauté privée avec une
// demande d'adhésion en attente d'un profil bloqué, et vérifie qu'elle
// n'apparaît PAS dans le panneau "Gestion".
//
// Navigation par clic sur la carte (pas initialCommunityId) volontairement :
// ce chemin utilise la fermeture goDetail la plus récente, avec
// myMemberships déjà chargé — indépendant du correctif séparé sur la course
// "lien direct/notification" (voir CommunitiesTab.joinRequestsEmptyOnDeepLink
// .dom.test.jsx), pour garder ce test ciblé sur le seul filtrage blockedIds.

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

// Sert à la fois la requête liste (.then(), utilisée par l'accueil) et la
// requête détail (.eq("id", ...).single(), utilisée par goDetail).
function makeCommunitiesBuilder(community) {
  const builder = {};
  ["select", "eq", "or", "ilike", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => Promise.resolve({ data: community, error: null }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [community], error: null, count: 1 }).then(resolve, reject);
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
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

async function openCommunityDetail() {
  const cards = await screen.findAllByRole("button", { name: /Communauté Privée Test/ });
  const user = userEvent.setup();
  await user.click(cards[0]);
  return user;
}

describe("CommunitiesTab — demandes d'adhésion : filtrage des profils bloqués", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const community = {
      id: "c1", name: "Communauté Privée Test", visibility: "private", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: null,
      created_at: new Date().toISOString(),
      community_members: [{ count: 4 }],
    };
    const joinRequest = {
      id: "jr1", community_id: "c1", profile_id: "blocked1", status: "pending",
      created_at: new Date().toISOString(),
      profiles: { name: "Profil Bloqué", avatar_url: null },
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunitiesBuilder(community);
      if (table === "community_members") return makeMembersBuilder("admin");
      if (table === "community_join_requests") return makeQueryBuilder({ data: [joinRequest], error: null });
      return makeQueryBuilder();
    });
  });

  it("n'affiche pas une demande d'adhésion provenant d'un profil bloqué dans le panneau Gestion", async () => {
    render(
      <CommunitiesTab
        currentUser={{ id: "admin1", name: "Admin" }}
        onError={vi.fn()}
        blockedIds={new Set(["blocked1"])}
      />
    );

    const user = await openCommunityDetail();
    await user.click(await screen.findByRole("button", { name: "Gestion" }));

    await screen.findByText("Demandes d'adhésion");
    expect(screen.queryByText("Profil Bloqué")).not.toBeInTheDocument();
    expect(screen.getByText("Aucune demande en attente.")).toBeInTheDocument();
  });

  it("affiche normalement une demande d'adhésion d'un profil NON bloqué", async () => {
    render(
      <CommunitiesTab
        currentUser={{ id: "admin1", name: "Admin" }}
        onError={vi.fn()}
        blockedIds={new Set()}
      />
    );

    const user = await openCommunityDetail();
    await user.click(await screen.findByRole("button", { name: "Gestion" }));

    await screen.findByText("Demandes d'adhésion");
    expect(await screen.findByText("Profil Bloqué")).toBeInTheDocument();
  });
});
