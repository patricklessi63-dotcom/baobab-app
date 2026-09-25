import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit des invitations à une communauté : accept_invite
// (supabase-communities.sql) insère la ligne community_members avec
// "on conflict (community_id, profile_id) do nothing" — donc réussit SANS
// ajouter de membre si l'invité·e est déjà membre au moment d'accepter (ex.
// une demande d'adhésion à cette même communauté, envoyée en parallèle, a
// été approuvée entre-temps pendant que l'invitation restait encore affichée
// comme "pending"). handleAcceptInvite (CommunitiesTab.jsx) appelait
// jusqu'ici adjustMemberCount(invite.community_id, 1) sans condition : dans
// ce scénario, le compteur de membres affiché devenait durablement supérieur
// de 1 au nombre réel, car rien ne vérifiait qu'un membre avait vraiment été
// ajouté. Ce test simule ce scénario (le nombre réel de membres, relu depuis
// la base après acceptation, reste 3 — inchangé) et vérifie que l'interface
// affiche bien 3 membres après avoir cliqué "Accepter", jamais 4.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

function makeSimpleBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

// Table "communities" : la requête liste (isNeutralHome, via .then()) renvoie
// la communauté avec son compteur RÉEL de membres (3, déjà à jour côté
// serveur), et la requête ".eq('id', ...).single()" — utilisée par
// refreshMemberCount après acceptation — renvoie ce MÊME compteur réel (3),
// pour simuler que l'insertion a bien été un no-op côté serveur.
function makeCommunitiesBuilder(community) {
  const builder = {};
  ["select", "eq", "or", "ilike", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => Promise.resolve({ data: community, error: null }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [community], error: null, count: 1 }).then(resolve, reject);
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

describe("CommunitiesTab — accepter une invitation déjà membre ne gonfle pas le compteur", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: null,
      created_at: new Date().toISOString(),
      community_members: [{ count: 3 }], // compte réel, déjà à jour côté serveur
    };
    const invite = {
      id: "inv1", community_id: "c1", invited_by: "staff1",
      communities: { name: "Communauté Test", cover_url: null },
      inviter: { name: "Une staffeuse" },
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunitiesBuilder(community);
      if (table === "community_invites") return makeSimpleBuilder({ data: [invite], error: null });
      // Adhésions locales déjà connues vides : le membership réel côté
      // serveur (via une autre voie, ex. demande d'adhésion approuvée) n'a
      // pas encore été rechargé côté client au moment où l'invitation
      // s'affiche encore comme "en attente".
      if (table === "community_members") return makeSimpleBuilder({ data: [], error: null });
      if (table === "community_join_requests") return makeSimpleBuilder({ data: [], error: null });
      return makeSimpleBuilder();
    });
    mocks.rpcMock.mockResolvedValue({ data: null, error: null }); // accept_invite : succès, mais no-op cote insertion
  });

  it("affiche toujours 3 membres (jamais 4) après avoir accepté une invitation à une communauté où l'on est déjà membre", async () => {
    const user = userEvent.setup();
    render(<CommunitiesTab currentUser={{ id: "u1", name: "Testeur" }} onError={vi.fn()} />);

    await screen.findByText("Invité·e par Une staffeuse");

    // Avant acceptation : 3 membres (la communauté apparaît plusieurs fois à
    // l'accueil neutre — Populaires/Nouvelles/Toutes les communautés).
    let counts = screen.getAllByText(/^\d+ membres?$/);
    expect(counts.length).toBeGreaterThan(0);
    counts.forEach((el) => expect(el.textContent).toMatch(/^ ?3 membres$/));

    await user.click(screen.getByRole("button", { name: "Accepter" }));

    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("accept_invite", { p_invite_id: "inv1" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument());

    // Après acceptation (no-op côté serveur) : toujours 3 membres, jamais 4.
    counts = screen.getAllByText(/^\d+ membres?$/);
    expect(counts.length).toBeGreaterThan(0);
    counts.forEach((el) => expect(el.textContent).toMatch(/^ ?3 membres$/));
  });
});
