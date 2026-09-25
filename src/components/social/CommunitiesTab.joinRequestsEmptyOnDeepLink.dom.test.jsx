import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit du flux "demande d'adhésion" (jamais audité
// jusqu'ici) : goDetail() ne lançait loadJoinRequests/loadReports que si
// "role" (une variable locale) valait déjà 'owner'/'admin'/'moderator' à cet
// instant précis. Pour une ouverture en LIEN DIRECT (initialCommunityId —
// exactement ce que fait un clic sur la notification "join_request_received"
// que ce même flux génère, voir SocialShell.jsx/openCommunityId), cette
// variable vient soit de myMemberships capturé par la fermeture figée de
// l'effet de montage (qui ne se relance jamais), soit d'un repli déclenché
// seulement si "membershipsLoadedRef.current" est encore false À CE MOMENT —
// or la requête "community_members" du montage (une seule colonne) répond
// quasiment toujours AVANT que goDetail ait fini ses deux allers-retours
// réseau séquentiels (communauté puis créateur). Un owner/admin qui ouvre sa
// communauté ainsi voyait donc l'onglet "Gestion" s'afficher (viewerRole,
// recalculé à CHAQUE rendu depuis l'état réel, est correct) mais rester VIDE
// — "Aucune demande en attente." — alors qu'une vraie demande l'attendait,
// jusqu'à quitter puis revenir sur la communauté.
//
// Ce test simule précisément cette course : la requête "community_members"
// du montage (qui alimente myMemberships) répond IMMÉDIATEMENT, avant même
// que les deux requêtes séquentielles de goDetail (communauté, puis
// créateur) ne soient résolues — reproduisant la situation réseau réelle où
// une requête à une seule colonne bat une requête à deux allers-retours.

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

// "community_members" : la requête de MONTAGE (.select("community_id, role")
// .eq("profile_id", ...).then()) répond dans un microtask immédiat — comme
// une vraie requête réseau à une seule colonne, très rapide. La requête de
// repli de goDetail (.maybeSingle(), utilisée seulement si le montage n'a
// pas encore fini) n'est ici volontairement JAMAIS censée être nécessaire :
// elle répond aussi, mais le test vérifie que le résultat ne dépend pas
// d'elle — c'est le chemin normal (rôle déjà connu) qui doit suffire.
function makeMembersBuilder(role) {
  const builder = {};
  ["select", "eq", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { role }, error: null }));
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [{ community_id: "c1", role }], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

// "communities" : DEUX allers-retours séquentiels avant que goDetail ne
// vérifie "role" (select communauté, puis select nom du créateur) — chacun
// retardé d'un micro-délai réel (setTimeout 0) pour garantir qu'ils résolvent
// APRÈS la requête "community_members" du montage ci-dessus, exactement
// comme sur un vrai réseau où cette dernière (une colonne, une ligne) est
// plus rapide que "communities" (toutes colonnes) suivie d'un aller-retour
// supplémentaire pour le profil du créateur.
function delayed(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), 0));
}

function makeCommunityBuilder(community) {
  const builder = {};
  ["select", "eq", "or", "ilike", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => delayed({ data: community, error: null }));
  builder.then = (resolve, reject) => delayed({ data: [community], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

function makeProfileBuilder(profile) {
  const builder = {};
  ["select", "eq"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => delayed({ data: profile, error: null }));
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

describe("CommunitiesTab — panneau Gestion non vide en ouverture par lien direct", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const community = {
      id: "c1", name: "Communauté Privée Test", visibility: "private", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: "founder1",
      created_at: new Date().toISOString(),
    };
    const joinRequest = {
      id: "jr1", community_id: "c1", profile_id: "applicant1", status: "pending",
      created_at: new Date().toISOString(),
      profiles: { name: "Candidat", avatar_url: null },
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "profiles") return makeProfileBuilder({ name: "Fondateur" });
      if (table === "community_members") return makeMembersBuilder("admin");
      if (table === "community_join_requests") return makeQueryBuilder({ data: [joinRequest], error: null });
      return makeQueryBuilder();
    });
  });

  it("affiche la demande d'adhésion en attente dès l'ouverture via initialCommunityId (lien de notification)", async () => {
    render(
      <CommunitiesTab
        currentUser={{ id: "admin1", name: "Admin" }}
        onError={vi.fn()}
        initialCommunityId="c1"
        blockedIds={new Set()}
      />
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Gestion" }));

    await screen.findByText("Demandes d'adhésion");
    // Avant le correctif : "Aucune demande en attente." restait affiché
    // indéfiniment malgré la vraie demande pendante en base.
    expect(await screen.findByText("Candidat")).toBeInTheDocument();
    expect(screen.queryByText("Aucune demande en attente.")).not.toBeInTheDocument();
  });
});
