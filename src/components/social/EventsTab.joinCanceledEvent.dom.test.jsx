import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit (même motif que addStory()/SocialShell.jsx, commit
// 57ff5ea) : join_event() (supabase-events-v2.sql) lève un message déjà
// propre en français ("Cet evenement est annule") quand l'événement a été
// annulé entre le chargement de la liste et le clic sur "Participer" (un
// autre onglet/session vient de l'annuler) — mais handleJoin() (EventsTab.jsx)
// l'ignorait et affichait toujours le même message générique fixe
// "Impossible de rejoindre cet événement.", sans jamais apprendre la vraie
// raison.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();

const EVENT_A = {
  id: "eA", title: "Soirée A", description: "", category: "rencontres", cover_url: null,
  event_date: FUTURE, duration_minutes: null, city: "Montréal", location: null,
  max_participants: null, visibility: "public", community_id: null,
  created_by: null, canceled_at: null, timezone: null, event_participant_count: 0,
};

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

function makeEventsChain() {
  const chain = {};
  ["select", "eq", "order", "limit", "is", "in", "ilike", "or", "gte", "lte"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.single = vi.fn(() => Promise.resolve({ data: EVENT_A, error: null }));
  chain.then = (resolve, reject) => Promise.resolve({ data: [EVENT_A], error: null, count: 1 }).then(resolve, reject);
  return chain;
}

const genericResponders = {
  event_attendees: () => ({ data: [], error: null }),
  event_comments: () => ({ data: [], error: null }),
  event_media: () => ({ data: [], error: null }),
  event_reports: () => ({ data: [], error: null }),
  event_staff: () => ({ data: null, error: null }),
  event_invitations: () => ({ data: [], error: null }),
  community_members: () => ({ data: [], error: null }),
  likes: () => ({ data: [], error: null }),
  profiles: (calls, kind) => (kind === "single" ? { data: { name: "Organisateur" }, error: null } : { data: [], error: null }),
};

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    rpc: mocks.rpcMock,
    storage: { from: vi.fn(() => ({ createSignedUrls: vi.fn(() => Promise.resolve({ data: [] })) })) },
  },
}));

import EventsTab from "./EventsTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fromMock.mockImplementation((table) => {
    if (table === "events") return makeEventsChain();
    return makeGenericChain((calls, kind) => (genericResponders[table] ? genericResponders[table](calls, kind) : { data: [], error: null, count: 0 }));
  });
  // Simule exactement le rejet renvoyé par join_event() quand l'événement
  // vient d'être annulé entre-temps (P0001, message déjà en français).
  mocks.rpcMock.mockResolvedValue({
    data: null,
    error: { code: "P0001", message: "Cet evenement est annule" },
  });
});

describe("EventsTab — handleJoin() affiche le vrai message serveur en cas de rejet (événement annulé entre-temps)", () => {
  it("affiche le message précis du trigger plutôt que le message générique fixe", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(
      <ImageLightboxProvider>
        <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={onError} />
      </ImageLightboxProvider>
    );

    await screen.findAllByText("Soirée A");
    await user.click(screen.getAllByText("Soirée A")[0]);
    await user.click(await screen.findByRole("button", { name: "🎟️ Participer" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith("Cet evenement est annule");
    expect(onError).not.toHaveBeenCalledWith("Impossible de rejoindre cet événement.");
  });
});
