import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit (même motif que addStory()/SocialShell.jsx, commit
// 57ff5ea) : check_event_invite_rate_limit()
// (supabase-global-action-rate-limit-fix.sql, 30 invitations/24h ou 40
// actions toutes tables confondues/60s) rejette l'insertion dans
// "event_invitations" avec un message déjà propre en français — mais
// handleInvite() (EventsTab.jsx) ne distinguait que le code Postgres 23505
// (déjà invité) et affichait sinon toujours le même message générique fixe
// "Impossible d'envoyer cette invitation.", masquant la vraie raison
// (limite de débit atteinte).

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();

const EVENT_A = {
  id: "eA", title: "Soirée A", description: "", category: "rencontres", cover_url: null,
  event_date: FUTURE, duration_minutes: null, city: "Montréal", location: null,
  max_participants: null, visibility: "private", community_id: null,
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

// Table "event_invitations" : select (lecture, invitations existantes/reçues)
// répond toujours vide ; insert() (envoi réel) rejette avec le message
// déjà propre en français du trigger de limite de débit.
function makeEventInvitationsChain() {
  const chain = {};
  ["select", "eq", "order", "limit"].forEach((m) => { chain[m] = vi.fn(() => chain); });
  chain.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
  chain.insert = vi.fn(() =>
    Promise.resolve({
      data: null,
      error: { code: "P0001", message: "Trop d invitations envoyees recemment, reessaie plus tard" },
    })
  );
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
    if (eqCall?.[1]?.[0] === "from_id") return { data: [{ to_id: "p1" }], error: null };
    return { data: [{ from_id: "p1" }], error: null };
  },
  profiles: (calls, kind) => {
    if (kind === "single") return { data: { name: "Organisateur" }, error: null };
    return { data: [
      { id: "p1", name: "Personne Un", avatar_url: null, is_founder: false, is_premium: false, email_verified: false, phone_verified: false },
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fromMock.mockImplementation((table) => {
    if (table === "events") return makeEventsChain();
    if (table === "event_invitations") return makeEventInvitationsChain();
    return makeGenericChain((calls, kind) => (genericResponders[table] ? genericResponders[table](calls, kind) : { data: [], error: null, count: 0 }));
  });
});

describe("EventsTab — handleInvite() affiche le vrai message serveur en cas de rejet (limite de débit)", () => {
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
    await screen.findByRole("button", { name: "Inviter" });
    await user.click(screen.getByRole("button", { name: "Inviter" }));

    const dialog = await screen.findByRole("dialog", { name: "Inviter des personnes" });
    await screen.findByText("Personne Un");
    await user.click(within(dialog).getByRole("button", { name: "Inviter" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith("Trop d invitations envoyees recemment, reessaie plus tard");
    expect(onError).not.toHaveBeenCalledWith("Impossible d'envoyer cette invitation.");
  });
});
