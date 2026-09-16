import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Bug identifié à l'audit de la liste d'attente des événements
// (EventsTab.jsx) : quand un·e participant·e "going" quitte un événement
// plafonné, promote_from_waitlist() (supabase-events-v2.sql) promeut
// immédiatement la première personne en liste d'attente au statut "going",
// côté base uniquement. Cette personne reçoit une notification
// "event_waitlist_promoted" (Realtime, déjà écoutée par ailleurs pour la
// cloche dans SocialShell.jsx), mais EventsTab n'en tenait aucun compte :
// myStatuses restait à "waitlisted" tant que le composant n'était pas
// remonté, donc le bouton affiché à l'écran restait "Sur liste d'attente —
// Quitter" alors que la personne participait déjà réellement (going).
//
// Ce test simule la réception de cette notification pendant que
// l'utilisateur·rice a l'événement ouvert et vérifie que le bouton bascule
// immédiatement sur l'état "going", sans recharger la page.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), channelCalls: [] }));

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
  title: "Brunch complet",
  description: "",
  category: "rencontres",
  cover_url: null,
  event_date: new Date(Date.now() + 7 * 864e5).toISOString(),
  duration_minutes: null,
  city: "Montréal",
  location: null,
  max_participants: 1,
  visibility: "public",
  community_id: null,
  created_by: "organizer1",
  canceled_at: null,
  timezone: null,
};

const tableResponders = {
  event_attendees: (calls) => {
    if (calls.some(([m]) => m === "delete")) return { error: null };
    const selectCall = calls.find(([m]) => m === "select");
    const arg = selectCall?.[1]?.[0] || "";
    if (arg.startsWith("event_id, status")) {
      // Statut initial côté serveur : en liste d'attente sur un événement
      // déjà plafonné (max_participants: 1).
      return { data: [{ event_id: "e1", status: "waitlisted" }], error: null };
    }
    return { data: [], error: null }; // loadParticipants (onglet "Participants")
  },
  community_members: () => ({ data: [], error: null }),
  likes: () => ({ data: [], error: null }),
  events: (calls, kind) => (kind === "single" ? { data: EVENT_ROW, error: null } : { data: [], error: null, count: 0 }),
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
    channel: vi.fn((name) => {
      const ch = {};
      ch.on = vi.fn((type, config, handler) => { mocks.channelCalls.push({ name, type, config, handler }); return ch; });
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
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
  mocks.channelCalls.length = 0;
  mocks.fromMock.mockImplementation((table) =>
    makeChain((calls, kind) => (tableResponders[table] ? tableResponders[table](calls, kind) : { data: [], error: null, count: 0 }))
  );
});

describe("EventsTab — promotion depuis la liste d'attente (Realtime)", () => {
  it("bascule le bouton de 'Sur liste d'attente' à 'Tu participes' dès réception de la notification event_waitlist_promoted", async () => {
    render(
      <ImageLightboxProvider>
        <EventsTab
          currentUser={{ id: "u1", name: "Testeur" }}
          onError={vi.fn()}
          initialEventId="e1"
          onConsumedInitial={vi.fn()}
        />
      </ImageLightboxProvider>
    );

    // Statut initial (chargé depuis event_attendees au montage) : en attente.
    await screen.findByRole("button", { name: /Sur liste d'attente — Quitter/ });

    const insertHandler = mocks.channelCalls.find(
      (c) => c.type === "postgres_changes" && c.config?.table === "notifications" && c.config?.event === "INSERT"
    )?.handler;
    expect(insertHandler).toBeTruthy();

    // Simule la notification envoyée par promote_from_waitlist() (trigger
    // SQL) quand quelqu'un d'autre a quitté l'événement complet entre-temps.
    insertHandler({
      new: {
        id: "n1",
        type: "event_waitlist_promoted",
        target_type: "event",
        target_id: "e1",
        recipient_id: "u1",
      },
    });

    // Sans le correctif, ce bouton restait affiché indéfiniment malgré la
    // promotion déjà effective côté serveur.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Sur liste d'attente — Quitter/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Tu participes ✓ — Ne plus participer/ })).toBeInTheDocument();
  });

  it("ignore les notifications d'un autre type ou d'un autre événement", async () => {
    render(
      <ImageLightboxProvider>
        <EventsTab
          currentUser={{ id: "u1", name: "Testeur" }}
          onError={vi.fn()}
          initialEventId="e1"
          onConsumedInitial={vi.fn()}
        />
      </ImageLightboxProvider>
    );

    await screen.findByRole("button", { name: /Sur liste d'attente — Quitter/ });

    const insertHandler = mocks.channelCalls.find(
      (c) => c.type === "postgres_changes" && c.config?.table === "notifications" && c.config?.event === "INSERT"
    )?.handler;

    insertHandler({ new: { id: "n2", type: "event_participation_confirmed", target_type: "event", target_id: "e1", recipient_id: "u1" } });
    insertHandler({ new: { id: "n3", type: "event_waitlist_promoted", target_type: "event", target_id: "autre-evenement", recipient_id: "u1" } });

    // Toujours en liste d'attente : ni l'un ni l'autre ne concernait cette
    // promotion précise.
    expect(screen.getByRole("button", { name: /Sur liste d'attente — Quitter/ })).toBeInTheDocument();
  });
});
