import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Apple 1.2 / Google Play UGC : (1) les photos d'un événement postées par une
// personne bloquée disparaissent (les commentaires l'étaient déjà) ; (2) le
// signalement d'un commentaire ou d'une photo remonte à onReportProfile (même
// modale/table `reports` que le profil, qui propose ensuite le blocage).

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

function makeChain(responder) {
  const chain = {};
  ["select", "eq", "order", "limit", "range", "is", "in", "ilike", "or", "gte", "lte", "match", "contains", "not"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder("maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder("single")));
  chain.then = (resolve, reject) => Promise.resolve(responder("then")).then(resolve, reject);
  return chain;
}

const EVENT_ROW = {
  id: "e1", title: "Pique-nique", description: "", category: "rencontres", cover_url: null,
  event_date: new Date(Date.now() + 7 * 864e5).toISOString(), duration_minutes: null, city: "Montréal",
  location: null, max_participants: null, visibility: "public", community_id: null, created_by: "organizer1",
  canceled_at: null, timezone: null, event_participant_count: 0,
};

const PHOTOS = [
  { id: "p1", event_id: "e1", uploaded_by: "friend", storage_path: "e1/a.jpg" },
  { id: "p2", event_id: "e1", uploaded_by: "blocked1", storage_path: "e1/b.jpg" },
];
const COMMENTS = [
  { id: "c1", event_id: "e1", author_id: "friend", body: "Super idée", profiles: { name: "Awa" } },
];

let eventList = [EVENT_ROW];
const tableResponders = {
  events: (kind) => (kind === "single" ? { data: EVENT_ROW, error: null } : { data: eventList, error: null, count: eventList.length }),
  event_media: () => ({ data: PHOTOS, error: null }),
  event_comments: () => ({ data: COMMENTS, error: null }),
  event_attendees: () => ({ data: [{ event_id: "e1", profile_id: "u1", status: "going", profiles: { id: "u1", name: "Testeur" } }], error: null }),
  profiles: (kind) => (kind === "single" ? { data: { name: "Organisateur" }, error: null } : { data: [], error: null }),
  event_staff: () => ({ data: null, error: null }),
};

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrls: vi.fn((paths) => Promise.resolve({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })) })),
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: "" } })),
      })),
    },
  },
}));

import EventsTab from "./EventsTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

beforeEach(() => {
  vi.clearAllMocks();
  eventList = [EVENT_ROW];
  mocks.fromMock.mockImplementation((table) =>
    makeChain((kind) => (tableResponders[table] ? tableResponders[table](kind) : { data: [], error: null, count: 0 }))
  );
});

function renderFiche(onReportProfile) {
  return render(
    <ImageLightboxProvider>
      <EventsTab
        currentUser={{ id: "u1", name: "Testeur" }}
        onError={vi.fn()}
        initialEventId="e1"
        blockedIds={new Set(["blocked1"])}
        onReportProfile={onReportProfile}
      />
    </ImageLightboxProvider>
  );
}

describe("EventsTab — contenu généré : blocage et signalement", () => {
  it("masque les photos d'une personne bloquée et signale l'auteur d'une photo restante", async () => {
    const onReportProfile = vi.fn();
    renderFiche(onReportProfile);
    fireEvent.click(await screen.findByRole("button", { name: "Photos" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Agrandir la photo" })).toHaveLength(1));
    expect(screen.getByText("1 photo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Signaler cette photo" }));
    expect(onReportProfile).toHaveBeenCalledWith({ id: "friend", name: "l'auteur de cette photo" });
  });

  it("signale l'auteur d'un message de la discussion", async () => {
    const onReportProfile = vi.fn();
    renderFiche(onReportProfile);
    fireEvent.click(await screen.findByRole("button", { name: "Discussion" }));
    fireEvent.click(await screen.findByRole("button", { name: "Signaler ce message" }));
    expect(onReportProfile).toHaveBeenCalledWith({ id: "friend", name: "Awa" });
  });

  it("la liste n'affiche plus les événements créés par une personne bloquée", async () => {
    eventList = [
      { ...EVENT_ROW, id: "e1", title: "Événement de l'ami", created_by: "friend" },
      { ...EVENT_ROW, id: "e2", title: "Événement du bloqué", created_by: "blocked1" },
    ];
    render(
      <ImageLightboxProvider>
        <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={vi.fn()} blockedIds={new Set(["blocked1"])} />
      </ImageLightboxProvider>
    );
    await waitFor(() => expect(screen.getAllByText("Événement de l'ami").length).toBeGreaterThan(0));
    expect(screen.queryByText("Événement du bloqué")).not.toBeInTheDocument();
  });
});
