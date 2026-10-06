import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// Audit de régression (6 oct. 2026) — CHEMIN NORMAL des listes (fil, communautés,
// événements, actualités) après l'ajout de l'état « erreur de chargement » :
// une liste réellement VIDE doit garder son état vide (jamais l'erreur), aucun
// avertissement d'erreur ne doit apparaître quand le réseau répond, et un
// évènement online/reprise sans erreur préalable ne doit rien relancer.

const mocks = vi.hoisted(() => ({ state: { posts: [], communities: [], events: [], news: [] }, reads: { posts: 0, communities: 0, events: 0, news: 0 } }));

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

function makeBuilder(table) {
  const b = {};
  ["select", "eq", "neq", "gt", "gte", "lt", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.then = (resolve, reject) => {
    const key = table === "immigration_news" ? "news" : table;
    if (key in mocks.reads) mocks.reads[key] += 1;
    const rows = mocks.state[key] || [];
    return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
  };
  return b;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn((table) => makeBuilder(table)),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import PostsFeed from "./PostsFeed";
import CommunitiesTab from "./CommunitiesTab";
import EventsTab from "./EventsTab";
import ImmigrationNewsView from "./ImmigrationNewsView";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { posts: [], communities: [], events: [], news: [] };
  mocks.reads = { posts: 0, communities: 0, events: 0, news: 0 };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const ME = { id: "u1", name: "Moi" };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });

describe("listes — réseau OK, liste réellement vide : état vide, jamais l'erreur", () => {
  it("fil : « Aucune publication », pas d'alerte", async () => {
    await act(async () => { render(<PostsFeed currentUser={ME} onError={vi.fn()} />); });
    await screen.findByText(/Aucune publication/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("communautés : état vide, pas d'alerte", async () => {
    render(<CommunitiesTab currentUser={ME} onError={vi.fn()} />);
    await screen.findByText(/pas encore de communauté/, {}, { timeout: 3000 });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("événements : état vide, pas d'alerte", async () => {
    render(<EventsTab currentUser={ME} onError={vi.fn()} />);
    await screen.findByText(/aucun événement/i, {}, { timeout: 3000 });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("actualités : « Aucune actualité », pas d'alerte", async () => {
    render(<ImmigrationNewsView onBack={() => {}} onError={vi.fn()} currentUser={ME} />);
    await screen.findByText(/Aucune actualité/, {}, { timeout: 3000 });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("listes — chargement réussi : un évènement online ou une reprise ne relance rien", () => {
  it("fil, communautés, événements, actualités : aucune requête de plus", async () => {
    mocks.state.posts = [{ id: "p1", author_id: "u2", body: "Bonjour la communauté", created_at: "2024-01-01T12:00:00Z", profiles: { name: "Awa" } }];
    mocks.state.communities = [{ id: "c1", name: "Groupe Montréal", category: "general", city: "Montréal", visibility: "public", created_at: "2024-01-01T12:00:00Z", description: "d", community_members: [{ count: 3 }] }];
    mocks.state.events = [{ id: "e1", title: "Soirée de bienvenue", category: "social", city: "Montréal", event_date: "2099-01-01T18:00:00Z", visibility: "public", created_at: "2024-01-01T12:00:00Z", timezone: "America/Toronto", event_attendees: [{ count: 1 }] }];
    mocks.state.news = [{ id: "n1", title: "Nouvelle règle d'immigration", url: "https://exemple.test/a", source: "IRCC", category: "general", published_at: "2024-01-01T12:00:00Z", summary: "résumé" }];
    await act(async () => {
      render(
        <>
          <PostsFeed currentUser={ME} onError={vi.fn()} />
          <CommunitiesTab currentUser={ME} onError={vi.fn()} />
          <EventsTab currentUser={ME} onError={vi.fn()} />
          <ImmigrationNewsView onBack={() => {}} onError={vi.fn()} currentUser={ME} />
        </>
      );
    });
    await screen.findByText("Bonjour la communauté");
    await settle();
    const before = { ...mocks.reads };
    act(() => { window.dispatchEvent(new Event("offline")); });
    act(() => { window.dispatchEvent(new Event("online")); });
    await settle();
    expect(mocks.reads.communities).toBe(before.communities);
    expect(mocks.reads.events).toBe(before.events);
    expect(mocks.reads.news).toBe(before.news);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
