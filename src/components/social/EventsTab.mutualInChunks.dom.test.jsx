import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit performance (6 oct. 2026) : EventsTab charge les profils des
// connexions mutuelles (likes croisés) avec UN `.in("id", mutualIds)`. La liste
// n'est pas bornée : à ~220 connexions l'URL GET (~38 caractères par uuid)
// dépasse la limite de la passerelle, la requête échoue sans erreur visible et
// la liste « Partager dans une conversation » / d'invitation reste vide. Ce
// test fournit 350 connexions mutuelles et vérifie le découpage en lots de 100
// ids au plus ET la fusion des profils (la liste de partage les affiche tous).

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

const N = 350;
const pad = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const MUTUAL_IDS = Array.from({ length: N }, (_, i) => pad(i));

function makeChain(responder) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "range", "is", "in", "ilike", "or", "gte", "lte", "match", "contains", "not", "delete", "update", "insert"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder(calls, "maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder(calls, "single")));
  chain.then = (resolve, reject) => Promise.resolve(responder(calls, "then")).then(resolve, reject);
  return chain;
}

const EVENT_ROW = {
  id: "e1", title: "Soirée jeux de société", description: "", category: "rencontres", cover_url: null,
  event_date: new Date(Date.now() + 7 * 864e5).toISOString(), duration_minutes: null, city: "Montréal",
  location: null, max_participants: null, visibility: "public", community_id: null, created_by: "organizer1",
  canceled_at: null, timezone: null, event_participant_count: 0,
};

let profileInCalls = [];
// Jeu de likes côté "serveur" (par défaut : les N connexions mutuelles). Le faux
// PostgREST TRONQUE à 1000 lignes par réponse, comme le vrai (max_rows).
let likesSentRows = null;
let likesReceivedRows = null;
let failFirstProfilesLot = false;

const tableResponders = {
  events: (calls, kind) => (kind === "single" ? { data: EVENT_ROW, error: null } : { data: [EVENT_ROW], error: null, count: 1 }),
  event_attendees: () => ({ data: [], error: null }),
  event_invitations: () => ({ data: [], error: null }),
  community_members: () => ({ data: [], error: null }),
  likes: (calls) => {
    const eqCall = calls.find(([m]) => m === "eq");
    const sent = eqCall?.[1]?.[0] === "from_id";
    const all = sent
      ? (likesSentRows || MUTUAL_IDS.map((id) => ({ to_id: id })))
      : (likesReceivedRows || MUTUAL_IDS.map((id) => ({ from_id: id })));
    const rangeCall = calls.find(([m]) => m === "range");
    const rows = rangeCall ? all.slice(rangeCall[1][0], rangeCall[1][1] + 1) : all;
    return { data: rows.slice(0, 1000), error: null };
  },
  profiles: (calls, kind) => {
    if (kind === "single") return { data: { name: "Organisateur" }, error: null };
    const inCall = calls.find(([m]) => m === "in");
    if (!inCall) return { data: [], error: null };
    const lot = inCall[1][1];
    profileInCalls.push(lot);
    if (failFirstProfilesLot && lot.includes(pad(0))) return { data: null, error: { message: "414 URI Too Long" } };
    return { data: lot.map((id) => ({ id, name: `Ami ${id.slice(-3)}`, avatar_url: null })), error: null };
  },
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
  profileInCalls = [];
  failFirstProfilesLot = false;
  likesSentRows = null;
  likesReceivedRows = null;
  mocks.fromMock.mockImplementation((table) =>
    makeChain((calls, kind) => (tableResponders[table] ? tableResponders[table](calls, kind) : { data: [], error: null, count: 0 }))
  );
  mocks.rpcMock.mockResolvedValue({ data: null, error: null });
});

async function openShareDialog() {
  const user = userEvent.setup();
  render(
    <ImageLightboxProvider>
      <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={vi.fn()} initialEventId="e1" />
    </ImageLightboxProvider>
  );
  await user.click(await screen.findByRole("button", { name: "Partager" }));
  await user.click(await screen.findByRole("button", { name: /Dans une conversation/ }));
  return screen.findByRole("dialog", { name: "Partager dans une conversation" });
}

describe("EventsTab — profils des connexions mutuelles chargés par lots", () => {
  it("350 connexions mutuelles : profils demandés par lots de 100 ids au plus, tous fusionnés dans la liste de partage", async () => {
    const dialog = await openShareDialog();
    await waitFor(() => expect(profileInCalls.flat()).toHaveLength(N));
    expect(profileInCalls.length).toBeGreaterThanOrEqual(4);
    expect(profileInCalls.every((ids) => ids.length <= 100)).toBe(true);
    expect(new Set(profileInCalls.flat()).size).toBe(N);
    await waitFor(() => expect(dialog.querySelectorAll("button.w-full.text-left")).toHaveLength(N));
  }, 30000);

  it("plafond PostgREST de 1000 lignes : 1500 likes envoyés ET reçus, les 1500 connexions mutuelles sont toutes trouvées (sans pagination, 1000 au plus)", async () => {
    const big = Array.from({ length: 1500 }, (_, i) => pad(i));
    likesSentRows = big.map((id) => ({ to_id: id }));
    likesReceivedRows = big.map((id) => ({ from_id: id }));
    await openShareDialog();
    await waitFor(() => expect(profileInCalls.flat()).toHaveLength(1500), { timeout: 10000 });
    expect(new Set(profileInCalls.flat()).size).toBe(1500);
  }, 60000);

  it("un lot en erreur est journalisé et les profils des autres lots restent affichés", async () => {
    failFirstProfilesLot = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dialog = await openShareDialog();
    await waitFor(() => expect(dialog.querySelectorAll("button.w-full.text-left")).toHaveLength(N - 100));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  }, 30000);
});
