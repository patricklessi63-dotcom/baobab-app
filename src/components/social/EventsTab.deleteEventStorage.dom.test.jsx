import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Monte le VRAI EventsTab : le créateur supprime définitivement son événement. Avant le
// correctif, la ligne "events" partait (cascade sur event_media) mais la couverture
// (event-covers) et les photos (event-media) restaient pour toujours dans le stockage.
// Vérifie l'ordre : listage AVANT le DELETE (la lecture dépend de can_view_event),
// retrait des fichiers APRÈS le DELETE confirmé, et aucun retrait si le DELETE échoue.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), log: [], deleteResult: { error: null } }));

function makeChain(responder) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "range", "is", "in", "ilike", "or", "gte", "lte", "match", "contains", "not", "update", "insert"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder(calls, "maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder(calls, "single")));
  chain.then = (resolve, reject) => Promise.resolve(responder(calls, "then")).then(resolve, reject);
  return chain;
}

const EVENT_ROW = {
  id: "e1",
  title: "Pique-nique",
  description: "",
  category: "rencontres",
  cover_url: null,
  event_date: new Date(Date.now() + 7 * 864e5).toISOString(),
  duration_minutes: null,
  city: "Montréal",
  location: null,
  max_participants: null,
  visibility: "public",
  community_id: null,
  created_by: "owner1",
  canceled_at: null,
  timezone: null,
};

const LISTINGS = {
  "event-covers": [{ id: "c", name: "1-cover.jpg" }],
  "event-media": [{ id: "p", name: "photo.jpg" }],
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
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: {
      from: vi.fn((bucket) => ({
        list: vi.fn(async (prefix) => {
          mocks.log.push(`list:${bucket}:${prefix}`);
          return { data: LISTINGS[bucket] || [], error: null };
        }),
        remove: vi.fn(async (paths) => {
          mocks.log.push(`remove:${bucket}:${paths.join(",")}`);
          return { data: paths.map((name) => ({ name })), error: null };
        }),
        createSignedUrls: vi.fn(() => Promise.resolve({ data: [] })),
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: "" } })),
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
      })),
    },
  },
}));

import EventsTab from "./EventsTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

function eventsBuilder() {
  const chain = makeChain((calls, kind) => (kind === "single" ? { data: EVENT_ROW, error: null } : { data: [], error: null, count: 0 }));
  chain.delete = vi.fn(() => ({
    eq: vi.fn((col, id) => {
      mocks.log.push(`delete:events:${id}`);
      return Promise.resolve(mocks.deleteResult);
    }),
  }));
  return chain;
}

async function deleteAsOwner() {
  const user = userEvent.setup();
  const onError = vi.fn();
  render(
    <ImageLightboxProvider>
      <EventsTab currentUser={{ id: "owner1", name: "Créatrice" }} onError={onError} initialEventId="e1" onConsumedInitial={vi.fn()} />
    </ImageLightboxProvider>
  );
  await user.click(await screen.findByRole("button", { name: /Supprimer l'événement/ }));
  await user.click(await screen.findByRole("button", { name: "Supprimer" }));
  return { onError };
}

describe("EventsTab — supprimer un événement retire aussi sa couverture et ses photos du stockage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.log.length = 0;
    mocks.deleteResult = { error: null };
    const responders = {
      event_staff: () => ({ data: { role: "organizer" }, error: null }),
    };
    mocks.fromMock.mockImplementation((table) => {
      if (table === "events") return eventsBuilder();
      return makeChain((calls, kind) => (responders[table] ? responders[table](calls, kind) : { data: [], error: null, count: 0 }));
    });
  });

  it("liste avant le DELETE, retire les fichiers après", async () => {
    await deleteAsOwner();
    await waitFor(() => expect(mocks.log.filter((l) => l.startsWith("remove:"))).toHaveLength(2));
    const iDelete = mocks.log.indexOf("delete:events:e1");
    expect(iDelete).toBeGreaterThan(mocks.log.indexOf("list:event-covers:e1"));
    expect(iDelete).toBeGreaterThan(mocks.log.indexOf("list:event-media:e1"));
    expect(mocks.log.indexOf("list:event-covers:e1")).toBeGreaterThanOrEqual(0);
    expect(mocks.log.slice(iDelete + 1)).toEqual([
      "remove:event-covers:e1/1-cover.jpg",
      "remove:event-media:e1/photo.jpg",
    ]);
  });

  it("si le DELETE échoue, aucun fichier n'est retiré et l'erreur est affichée", async () => {
    mocks.deleteResult = { error: { message: "refusé" } };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { onError } = await deleteAsOwner();
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de supprimer cet événement."));
    expect(mocks.log).toContain("delete:events:e1");
    expect(mocks.log.some((l) => l.startsWith("remove:"))).toBe(false);
    err.mockRestore();
  });
});
