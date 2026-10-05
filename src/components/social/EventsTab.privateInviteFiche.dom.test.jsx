import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Audit des événements PRIVÉS côté personne invitée : depuis la FICHE (ouverte
// directement, ex. depuis "Mes événements" ou un lien), l'invitation en attente
// doit pouvoir être acceptée ou refusée (avant : seul un "Participer"
// join_event, qui laissait l'invitation "pending" à jamais). Refuser une
// invitation à un événement PRIVÉ fait en plus perdre l'accès : retour à
// l'accueil et l'événement disparaît de la liste (can_view_event() côté SQL
// laisse aujourd'hui passer les invitations "declined" — voir DEPLOIEMENT.md —
// donc la liste le renvoie encore ; le filtre client en est le miroir).

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

function makeChain(responder) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "is", "in", "ilike", "or", "gte", "lte", "match", "contains", "not", "delete", "update", "insert"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder(calls, "maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder(calls, "single")));
  chain.then = (resolve, reject) => Promise.resolve(responder(calls, "then")).then(resolve, reject);
  return chain;
}

const EVENT_ROW = {
  id: "e1",
  title: "Soirée jeux de société",
  description: "",
  category: "rencontres",
  cover_url: null,
  event_date: new Date(Date.now() + 7 * 864e5).toISOString(),
  duration_minutes: null,
  city: "Montréal",
  location: null,
  max_participants: null,
  visibility: "private",
  community_id: null,
  created_by: "organizer1",
  canceled_at: null,
  timezone: null,
  event_participant_count: 0,
};

const PENDING_INVITE = {
  id: "inv1",
  event_id: "e1",
  invited_by: "organizer1",
  events: { title: "Soirée jeux de société", cover_url: null },
  inviter: { name: "Aïcha" },
};

const tableResponders = {
  events: (calls, kind) => (kind === "single" ? { data: EVENT_ROW, error: null } : { data: [EVENT_ROW], error: null, count: 1 }),
  event_attendees: () => ({ data: [], error: null }),
  event_invitations: (calls) => {
    const arg = calls.find(([m]) => m === "select")?.[1]?.[0] || "";
    if (arg.startsWith("id, event_id")) return { data: [PENDING_INVITE], error: null };
    return { data: [], error: null };
  },
  community_members: () => ({ data: [], error: null }),
  likes: () => ({ data: [], error: null }),
  profiles: (calls, kind) => (kind === "single" ? { data: { name: "Organisateur" }, error: null } : { data: [], error: null }),
  event_staff: () => ({ data: null, error: null }),
  event_comments: () => ({ data: [], error: null }),
  event_media: () => ({ data: [], error: null }),
  event_reports: () => ({ data: [], error: null }),
  analytics_events: () => ({ data: null, error: null }),
};

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => {
      const ch = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: mocks.rpcMock,
    storage: {
      from: vi.fn(() => ({
        createSignedUrls: vi.fn(() => Promise.resolve({ data: [] })),
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: "" } })),
        remove: vi.fn(),
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
      })),
    },
  },
}));

import EventsTab from "./EventsTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fromMock.mockImplementation((table) =>
    makeChain((calls, kind) => (tableResponders[table] ? tableResponders[table](calls, kind) : { data: [], error: null, count: 0 }))
  );
  mocks.rpcMock.mockResolvedValue({ data: { status: "going" }, error: null });
});

function renderFiche() {
  return render(
    <ImageLightboxProvider>
      <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={vi.fn()} initialEventId="e1" />
    </ImageLightboxProvider>
  );
}

describe("EventsTab — fiche d'un événement privé pour une personne invitée", () => {
  it("propose Accepter/Refuser l'invitation depuis la fiche, et Accepter appelle accept_event_invitation", async () => {
    renderFiche();
    const accept = await screen.findByRole("button", { name: "Accepter l'invitation" });
    expect(screen.queryByRole("button", { name: /Participer/ })).not.toBeInTheDocument();
    fireEvent.click(accept);
    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("accept_event_invitation", { p_invitation_id: "inv1" }));
    await screen.findByRole("button", { name: /Ne plus participer/ });
    expect(screen.queryByRole("button", { name: "Refuser" })).not.toBeInTheDocument();
  });

  it("Refuser depuis la fiche appelle decline_event_invitation, revient à l'accueil et masque l'événement privé", async () => {
    renderFiche();
    fireEvent.click(await screen.findByRole("button", { name: "Refuser" }));
    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("decline_event_invitation", { p_invitation_id: "inv1" }));
    // Retour à l'accueil : plus de fiche, et l'événement (encore renvoyé par la
    // RLS actuelle) n'est plus listé.
    await screen.findByText("Il n'y a aucun événement pour le moment.");
    expect(screen.queryByText("Soirée jeux de société")).not.toBeInTheDocument();
  });
});
