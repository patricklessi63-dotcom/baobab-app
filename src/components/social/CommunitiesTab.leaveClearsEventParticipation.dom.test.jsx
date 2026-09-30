import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit du bouton "Quitter la communauté" pour un membre
// NORMAL (pas owner) — jamais audité jusqu'ici, contrairement au garde-fou
// "communauté orpheline" déjà corrigé pour un owner/admin unique (eb43ad4).
// Scénario réel : un membre a une invitation "en attente" à un événement
// réservé aux membres (visibility = 'community') de cette communauté, ET
// participe déjà ("going") à un autre de ces événements. Avant ce correctif,
// handleLeave (CommunitiesTab.jsx) se contentait de supprimer la ligne
// community_members : l'invitation restait "pending" indéfiniment (alors que
// accept_event_invitation(), supabase-events-v2.sql, ne revérifie pas
// l'appartenance à la communauté au moment d'accepter — risque signalé hors
// de portée dans le commit, fichier supabase-*.sql interdit) et
// l'inscription "going" déjà confirmée restait valide, alors que la personne
// n'est plus membre — incohérent avec can_view_event() qui exige
// is_community_member() pour ces événements.
//
// Ce test monte le VRAI CommunitiesTab en tant que membre normal, ouvre
// l'onglet "Événements" d'une communauté publique où l'on est déjà inscrit
// "going" à un événement réservé aux membres, clique "Quitter" + confirme, et
// vérifie que le départ décline bien l'invitation en attente et retire bien
// la participation confirmée à l'événement réservé aux membres.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

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
  builder.then = (resolve, reject) => Promise.resolve({ data: [community], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

// "member" (pas owner) : le garde-fou "communauté orpheline" (eb43ad4) ne
// doit pas se déclencher, et le bouton "Quitter" doit être affiché.
function makeMembersBuilder(role) {
  const builder = {};
  ["select", "eq", "order", "limit", "delete"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { role }, error: null }));
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [{ id: "mem1", community_id: "c1", role, profile_id: "u1" }], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

// "events" : select("*, event_participant_count") (loadEvents, liste
// affichée) vs select("id") (nettoyage dans handleLeave, uniquement les
// événements 'community' futurs non annulés de c1).
function makeEventsBuilder(event) {
  const builder = {};
  let mode = "list";
  builder.select = vi.fn((cols) => {
    mode = String(cols).includes("event_participant_count") ? "list" : "ids";
    return builder;
  });
  ["eq", "is", "gte", "order"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) => {
    const data = mode === "list" ? [event] : [{ id: event.id }];
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return builder;
}

// "event_attendees" : select (loadEvents, statut "going" déjà affiché) vs
// delete (nettoyage dans handleLeave) — capture les arguments du delete.
function makeAttendeesBuilder(attendeesDeleteSpy) {
  const builder = {};
  builder.select = vi.fn(() => builder);
  ["eq", "in"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [{ event_id: "ev1", status: "going" }], error: null }).then(resolve, reject);
  builder.delete = vi.fn(() => {
    const delBuilder = {};
    delBuilder.eq = vi.fn((col, val) => { attendeesDeleteSpy(col, val); return delBuilder; });
    delBuilder.in = vi.fn((col, val) => { attendeesDeleteSpy(col, val); return delBuilder; });
    delBuilder.then = (resolve2, reject2) => Promise.resolve({ error: null }).then(resolve2, reject2);
    return delBuilder;
  });
  return builder;
}

// "event_invitations" : une invitation "pending" à un AUTRE événement
// 'community' de cette même communauté (ev2), pas encore acceptée/déclinée.
function makeInvitationsBuilder(invitation) {
  const builder = {};
  ["select", "eq", "in"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) => Promise.resolve({ data: [invitation], error: null }).then(resolve, reject);
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

describe("CommunitiesTab — quitter une communauté nettoie participations/invitations à ses événements réservés aux membres", () => {
  let attendeesDeleteSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    attendeesDeleteSpy = vi.fn();

    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: "owner1",
      created_at: new Date().toISOString(),
    };
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const event = {
      id: "ev1", community_id: "c1", visibility: "community", canceled_at: null,
      title: "Soirée membres", category: "general", city: "", cover_url: null,
      max_participants: null, event_date: futureDate, event_participant_count: 1,
    };
    const invitation = { id: "inv1", event_id: "ev2", invited_profile_id: "u1", status: "pending" };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder("member");
      if (table === "events") return makeEventsBuilder(event);
      if (table === "event_attendees") return makeAttendeesBuilder(attendeesDeleteSpy);
      if (table === "event_invitations") return makeInvitationsBuilder(invitation);
      return makeQueryBuilder();
    });
    mocks.rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it("décline l'invitation en attente et retire la participation confirmée en quittant la communauté", async () => {
    const user = userEvent.setup();
    render(
      <CommunitiesTab
        currentUser={{ id: "u1", name: "Membre" }}
        onError={vi.fn()}
        initialCommunityId="c1"
      />
    );

    await user.click(await screen.findByRole("button", { name: "Événements" }));
    await screen.findByText("Tu participes ✓");

    await user.click(screen.getByRole("button", { name: "Quitter la communauté" }));
    await user.click(await screen.findByRole("button", { name: "Quitter" }));

    // L'invitation en attente à un événement réservé aux membres de cette
    // communauté est déclinée via le RPC dédié (la seule voie autorisée par
    // la RLS pour un simple invité, voir "Le staff revoque une invitation").
    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("decline_event_invitation", { p_invitation_id: "inv1" }));

    // La participation "going" déjà confirmée à l'événement réservé aux
    // membres est retirée (DELETE event_attendees ciblant bien ce profil et
    // cet événement).
    await waitFor(() => {
      expect(attendeesDeleteSpy).toHaveBeenCalledWith("profile_id", "u1");
      expect(attendeesDeleteSpy).toHaveBeenCalledWith("event_id", ["ev1"]);
    });

    // Le badge "Tu participes ✓" disparaît bien de l'affichage local, sans
    // attendre un rechargement complet de la page.
    await waitFor(() => expect(screen.queryByText("Tu participes ✓")).not.toBeInTheDocument());
  });
});
