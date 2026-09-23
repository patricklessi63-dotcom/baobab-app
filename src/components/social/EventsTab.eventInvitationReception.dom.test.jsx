import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Bug identifié à l'audit du côté RÉCEPTION des invitations à un événement
// (voir commentaire sur myEventInvites dans EventsTab.jsx) : les RPC
// accept_event_invitation()/decline_event_invitation() existent depuis
// longtemps côté base (supabase-events-v2.sql, affinées par
// supabase-events-guards.sql — capacité pleine → liste d'attente silencieuse,
// événement annulé/déjà passé → erreur propre) mais n'étaient appelées nulle
// part dans le front : aucune section "Tes invitations" pour les événements
// (contrairement à CommunitiesTab.jsx), donc aucun moyen de refuser une
// invitation, et accept_event_invitation() jamais invoquée non plus (seul un
// "Participer" ordinaire, qui laisse l'invitation "pending" pour toujours).
//
// Ce test vérifie que la section ajoutée affiche bien l'invitation en
// attente, qu'Accepter/Refuser appellent la bonne RPC, que l'invitation
// disparaît de la liste une fois traitée, et qu'un double-clic rapide sur
// "Accepter" ne déclenche qu'un seul appel RPC (même garde anti-double-clic
// que inviteInFlightRef dans CommunitiesTab.jsx).

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
    const selectCall = calls.find(([m]) => m === "select");
    const arg = selectCall?.[1]?.[0] || "";
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

function renderHome() {
  return render(
    <ImageLightboxProvider>
      <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={vi.fn()} />
    </ImageLightboxProvider>
  );
}

describe("EventsTab — réception d'une invitation à un événement", () => {
  it("affiche l'invitation en attente avec Accepter/Refuser, et Accepter appelle accept_event_invitation puis la retire de la liste", async () => {
    renderHome();

    await screen.findByText("Invité·e par Aïcha");
    const acceptBtn = screen.getByRole("button", { name: "Accepter" });
    fireEvent.click(acceptBtn);

    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("accept_event_invitation", { p_invitation_id: "inv1" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument());
  });

  it("un double-clic rapide sur Accepter ne déclenche qu'un seul appel RPC", async () => {
    let resolveRpc;
    mocks.rpcMock.mockReturnValue(new Promise((r) => { resolveRpc = r; }));

    renderHome();

    await screen.findByText("Invité·e par Aïcha");
    const acceptBtn = screen.getByRole("button", { name: "Accepter" });
    fireEvent.click(acceptBtn);
    fireEvent.click(acceptBtn);
    fireEvent.click(acceptBtn);

    expect(mocks.rpcMock).toHaveBeenCalledTimes(1);
    resolveRpc({ data: { status: "going" }, error: null });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument());
  });

  it("Refuser appelle decline_event_invitation puis retire l'invitation de la liste", async () => {
    renderHome();

    await screen.findByText("Invité·e par Aïcha");
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));

    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("decline_event_invitation", { p_invitation_id: "inv1" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Refuser" })).not.toBeInTheDocument());
  });
});
