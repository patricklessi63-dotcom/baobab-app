import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Pendant « côté staff » de CommunitiesTab.leaveClearsEventParticipation.dom.test.jsx.
//
// Trou documenté (DEPLOIEMENT.md §6, audit du 30 sept. 2026) : quand un owner/admin EXCLUT un membre, ce
// membre gardait ses invitations « en attente » et son inscription (« going ») aux événements réservés aux
// membres (visibility = 'community') de la communauté. Le correctif de handleLeave (décliner via
// decline_event_invitation, DELETE sur event_attendees) ne peut pas être réutilisé par le staff : la RPC exige
// invited_profile_id = soi et la policy DELETE d'event_attendees n'ouvre que « soi-même » ou le staff de CET
// événement (supabase-events-v2.sql).
//
// handleRemoveMember appelle donc la fonction SECURITY DEFINER remove_community_member_and_cleanup_events
// (supabase-remove-community-member-cleanup-events-fix.sql), qui vérifie les droits, nettoie puis supprime
// la ligne community_members dans une seule transaction. Ce test monte le VRAI CommunitiesTab en tant que
// propriétaire, exclut un membre qui a une invitation en attente et une participation confirmée, et vérifie
// que (1) seul ce RPC est appelé, avec la bonne ligne de membre ; (2) le client ne tente PAS le nettoyage
// qu'il n'a pas le droit de faire (aucun DELETE direct de community_members, d'event_attendees, aucun
// decline_event_invitation) ; (3) l'échec du RPC laisse le membre dans la liste et affiche l'erreur.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not", "delete", "update", "insert"].forEach((m) => {
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

// community_members : les adhésions de l'utilisateur (select "community_id, role"), la liste des membres
// (select avec jointure profiles) et le repli maybeSingle. `delete` est espionné : il ne doit JAMAIS être appelé.
function makeMembersBuilder(members, deleteSpy) {
  const builder = {};
  let mode = "mine";
  builder.select = vi.fn((cols) => {
    mode = String(cols).includes("profiles(") ? "list" : "mine";
    return builder;
  });
  ["eq", "order", "limit", "update", "insert"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.delete = vi.fn((...args) => { deleteSpy(...args); return builder; });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { role: "owner" }, error: null }));
  builder.then = (resolve, reject) => {
    const result = mode === "list"
      ? { data: members, error: null, count: members.length }
      : { data: [{ community_id: "c1", role: "owner" }], error: null, count: 1 };
    return Promise.resolve(result).then(resolve, reject);
  };
  return builder;
}

// events : liste affichée (select "*, event_participant_count") ; le nettoyage (select "id") ne doit pas partir.
function makeEventsBuilder(events) {
  const builder = {};
  ["select", "eq", "is", "gte", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) => Promise.resolve({ data: events, error: null }).then(resolve, reject);
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

const profile = (id, name) => ({ id, name, avatar_url: null, city: "", show_city: false, is_founder: false, is_premium: false, email_verified: false, phone_verified: false, banned_at: null, suspended_until: null });

describe("CommunitiesTab — exclure un membre passe par la RPC qui nettoie ses événements réservés aux membres", () => {
  let membersDeleteSpy;
  let attendeesDeleteSpy;
  let onError;

  beforeEach(() => {
    vi.clearAllMocks();
    membersDeleteSpy = vi.fn();
    attendeesDeleteSpy = vi.fn();
    onError = vi.fn();

    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: "u1",
      created_at: new Date().toISOString(),
    };
    const members = [
      { id: "mem1", community_id: "c1", profile_id: "u1", role: "owner", joined_at: "2026-01-01T00:00:00Z", profiles: profile("u1", "Proprio") },
      { id: "mem2", community_id: "c1", profile_id: "u2", role: "member", joined_at: "2026-01-02T00:00:00Z", profiles: profile("u2", "Karim") },
    ];
    // Karim est inscrit « going » à ev1 (événement réservé aux membres) et a une invitation « pending » à ev2.
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const events = [{
      id: "ev1", community_id: "c1", visibility: "community", canceled_at: null,
      title: "Soirée membres", category: "general", city: "", cover_url: null,
      max_participants: null, event_date: futureDate, event_participant_count: 1,
    }];

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder(members, membersDeleteSpy);
      if (table === "events") return makeEventsBuilder(events);
      if (table === "event_attendees") {
        const b = makeQueryBuilder({ data: [], error: null });
        b.delete = vi.fn((...args) => { attendeesDeleteSpy(...args); return b; });
        return b;
      }
      return makeQueryBuilder();
    });
    mocks.rpcMock.mockResolvedValue({ data: null, error: null });
  });

  const openMembers = async (user) => {
    render(
      <CommunitiesTab
        currentUser={{ id: "u1", name: "Proprio" }}
        onError={onError}
        initialCommunityId="c1"
      />
    );
    await user.click(await screen.findByRole("button", { name: "Membres" }));
    return screen.findByRole("button", { name: "Retirer Karim de la communauté" });
  };

  it("appelle remove_community_member_and_cleanup_events avec la ligne du membre, sans DELETE direct ni nettoyage côté client", async () => {
    const user = userEvent.setup();
    const removeButton = await openMembers(user);

    await user.click(removeButton);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Retirer" }));

    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("remove_community_member_and_cleanup_events", { p_member_id: "mem2" }));
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1);

    // Le client ne tente rien de ce que la RLS lui refuserait : la RPC fait tout, avec les droits du staff
    // vérifiés côté serveur.
    expect(membersDeleteSpy).not.toHaveBeenCalled();
    expect(attendeesDeleteSpy).not.toHaveBeenCalled();
    expect(mocks.rpcMock).not.toHaveBeenCalledWith("decline_event_invitation", expect.anything());
    expect(mocks.fromMock).not.toHaveBeenCalledWith("event_invitations");

    // Le membre disparaît de la liste, sans erreur affichée.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retirer Karim de la communauté" })).not.toBeInTheDocument());
    expect(onError).not.toHaveBeenCalled();
  });

  it("si la RPC échoue (droits refusés, SQL pas encore exécuté...), le membre reste listé et l'erreur est affichée", async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: "Droits insuffisants pour retirer ce membre" } });
    const user = userEvent.setup();
    const removeButton = await openMembers(user);

    await user.click(removeButton);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Retirer" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de retirer ce membre."));
    expect(screen.getByRole("button", { name: "Retirer Karim de la communauté" })).toBeInTheDocument();
    expect(membersDeleteSpy).not.toHaveBeenCalled();
  });
});
