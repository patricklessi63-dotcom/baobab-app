import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit des invitations (même famille exacte que
// detailRequestRef déjà présent dans EventsTab.jsx, et que searchSeqRef dans
// CommunityInviteModal.jsx) : openInvite() enchaîne un aller-retour réseau
// (invitations existantes + participants actuels de l'événement) avant
// d'appliquer invitedIds/inviteCandidates, sans aucun jeton de séquence.
//
// Scénario concret : ouvrir "Inviter" sur l'événement A (requête lente), la
// fermer, revenir à l'accueil, ouvrir "Inviter" sur l'événement B (requête
// rapide, qui s'affiche donc en premier) — puis la réponse tardive de A
// arrivait quand même et écrasait les candidats/invités affichés, alors que
// la modale est maintenant bien celle de B (inviteEvent déjà à jour). Un
// clic sur "Inviter" dans cette modale aurait alors utilisé le bon
// event_id (B), mais sur une liste de candidats et des badges "Invité"
// n'ayant plus aucun rapport avec B.
//
// Ce test ouvre l'invite sur l'événement A (réponse jamais résolue pendant le
// test), revient à l'accueil, ouvre l'invite sur B (réponse immédiate), puis
// résout la réponse tardive de A et vérifie qu'elle ne remplace pas les
// candidats affichés pour B.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();

function makeEvent(id, title) {
  return {
    id, title, description: "", category: "rencontres", cover_url: null,
    event_date: FUTURE, duration_minutes: null, city: "Montréal", location: null,
    max_participants: null, visibility: "private", community_id: null,
    created_by: null, canceled_at: null, timezone: null, event_participant_count: 0,
  };
}

const EVENT_A = makeEvent("eA", "Soirée A");
const EVENT_B = makeEvent("eB", "Soirée B");

function makeGenericChain(responder) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "is", "in", "ilike", "or", "gte", "lte", "match", "contains", "not"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder(calls, "maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder(calls, "single")));
  chain.then = (resolve, reject) => Promise.resolve(responder(calls, "then")).then(resolve, reject);
  return chain;
}

// Table "events" : distingue la requête de liste (accueil, via .then(), sans
// .single()) de la requête de détail (goDetail, avec .eq("id",...).single()).
function makeEventsChain() {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "is", "in", "ilike", "or", "gte", "lte"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.single = vi.fn(() => {
    const idCall = calls.find(([m]) => m === "eq" && m !== undefined);
    const id = calls.find(([m, args]) => m === "eq")?.[1]?.[1];
    const ev = id === "eA" ? EVENT_A : EVENT_B;
    return Promise.resolve({ data: ev, error: null });
  });
  chain.then = (resolve, reject) => Promise.resolve({ data: [EVENT_A, EVENT_B], error: null, count: 2 }).then(resolve, reject);
  return chain;
}

// Table "event_invitations" : deux formes utilisées par EventsTab —
// "id, event_id, invited_by, events(...)" (invitations reçues, au montage) et
// "invited_profile_id" (invitations déjà envoyées pour CET événement, dans
// openInvite). Pour cette dernière : réponse volontairement JAMAIS résolue
// pour l'événement A (garde le "requestId" de A en vol pendant tout le test),
// réponse immédiate pour B.
function makeEventInvitationsChain(state) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.then = (resolve, reject) => {
    const selectCall = calls.find(([m]) => m === "select");
    const cols = String(selectCall?.[1]?.[0] || "");
    if (cols.startsWith("id, event_id")) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    }
    // cols === "invited_profile_id" : requête d'ouverture de la modale
    // d'invitation pour un événement précis.
    const eventId = calls.find(([m]) => m === "eq")?.[1]?.[1];
    if (eventId === "eA") {
      return state.eventAInvitesPromise.then(resolve, reject);
    }
    return Promise.resolve({ data: [{ invited_profile_id: "p2" }], error: null }).then(resolve, reject);
  };
  return chain;
}

const genericResponders = {
  event_attendees: () => ({ data: [], error: null }),
  event_comments: () => ({ data: [], error: null }),
  event_media: () => ({ data: [], error: null }),
  event_reports: () => ({ data: [], error: null }),
  event_staff: () => ({ data: null, error: null }),
  community_members: () => ({ data: [], error: null }),
  likes: (calls) => {
    const eqCall = calls.find(([m]) => m === "eq");
    // "from_id" => envoyés, "to_id" => reçus — les deux profils p1/p2 sont
    // mutuels (likes croisés), donc tous deux candidats à l'invitation.
    if (eqCall?.[1]?.[0] === "from_id") return { data: [{ to_id: "p1" }, { to_id: "p2" }], error: null };
    return { data: [{ from_id: "p1" }, { from_id: "p2" }], error: null };
  },
  profiles: (calls, kind) => {
    if (kind === "single") return { data: { name: "Organisateur" }, error: null };
    return { data: [
      { id: "p1", name: "Personne Un", avatar_url: null, is_founder: false, is_premium: false, email_verified: false, phone_verified: false },
      { id: "p2", name: "Personne Deux", avatar_url: null, is_founder: false, is_premium: false, email_verified: false, phone_verified: false },
    ], error: null };
  },
};

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ createSignedUrls: vi.fn(() => Promise.resolve({ data: [] })) })) },
  },
}));

import EventsTab from "./EventsTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

let resolveEventAInvites;

beforeEach(() => {
  vi.clearAllMocks();
  const state = { eventAInvitesPromise: new Promise((r) => { resolveEventAInvites = r; }) };
  mocks.fromMock.mockImplementation((table) => {
    if (table === "events") return makeEventsChain();
    if (table === "event_invitations") return makeEventInvitationsChain(state);
    return makeGenericChain((calls, kind) => (genericResponders[table] ? genericResponders[table](calls, kind) : { data: [], error: null, count: 0 }));
  });
});

describe("EventsTab — course entre deux ouvertures de la modale d'invitation", () => {
  it("la réponse tardive de l'invite ouverte sur A n'écrase pas les candidats affichés pour B", async () => {
    const user = userEvent.setup();
    render(
      <ImageLightboxProvider>
        <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={vi.fn()} />
      </ImageLightboxProvider>
    );

    await screen.findAllByText("Soirée A");
    await user.click(screen.getAllByText("Soirée A")[0]);
    await screen.findByRole("button", { name: "Inviter" });
    await user.click(screen.getByRole("button", { name: "Inviter" }));

    // Modale ouverte sur A : sa requête reste en vol (jamais résolue ici).
    await screen.findByRole("dialog", { name: "Inviter des personnes" });

    // Ferme la modale et revient à l'accueil, puis ouvre B (requête rapide).
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    await user.click(screen.getByRole("button", { name: "Événements" }));
    await screen.findAllByText("Soirée B");
    await user.click(screen.getAllByText("Soirée B")[0]);
    await screen.findByRole("button", { name: "Inviter" });
    await user.click(screen.getByRole("button", { name: "Inviter" }));

    // B : "Personne Un" (p1) doit être proposée (pas encore invitée sur B),
    // "Personne Deux" (p2) déjà invitée sur B (voir mock ci-dessus).
    await screen.findByText("Personne Un");
    expect(screen.getAllByText("Invité").length).toBe(1); // seule p2 est déjà invitée sur B

    // La réponse tardive de A arrive maintenant : sur A, p2 N'ÉTAIT PAS
    // invitée (liste vide) — sans le correctif, ceci écraserait invitedIds
    // affiché pour B en le vidant (plus aucun badge "Invité").
    await act(async () => {
      resolveEventAInvites({ data: [], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Toujours l'état de B : p2 toujours marquée "Invité".
    expect(screen.getAllByText("Invité").length).toBe(1);
  });
});
