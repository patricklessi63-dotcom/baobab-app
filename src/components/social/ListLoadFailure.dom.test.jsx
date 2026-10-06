import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit réseau (6 oct. 2026) : quand le premier chargement d'une liste (fil,
// communautés, événements) échouait — lancement dans le métro, réseau muet —
// l'écran affichait l'état VIDE (« Aucune publication », « pas encore de
// communauté »...), indiscernable d'une liste réellement vide, et rien ne
// rejouait la requête au retour du réseau (le correctif de reconnexion du fil
// sortait explicitement quand rien n'était encore chargé). On affiche
// maintenant une erreur avec « Réessayer », rejouée toute seule au retour du
// réseau.

const mocks = vi.hoisted(() => ({ state: { failReads: false, posts: [], communities: [], events: [], news: [] } }));

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

const NET = { message: "TypeError: Failed to fetch", code: "" };

function makeBuilder(table) {
  const b = {};
  ["select", "eq", "neq", "gt", "gte", "lt", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.then = (resolve, reject) => {
    const rows = table === "posts" ? mocks.state.posts : table === "communities" ? mocks.state.communities : table === "events" ? mocks.state.events : table === "immigration_news" ? mocks.state.news : [];
    const result = mocks.state.failReads
      ? { data: null, error: NET, count: null }
      : { data: rows, error: null, count: rows.length };
    return Promise.resolve(result).then(resolve, reject);
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

let onLine;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.failReads = true;
  mocks.state.posts = [{ id: "p1", author_id: "u2", body: "Bonjour la communauté", created_at: "2024-01-01T12:00:00Z", profiles: { name: "Awa" } }];
  mocks.state.communities = [{ id: "c1", name: "Groupe Montréal", category: "general", city: "Montréal", visibility: "public", created_at: "2024-01-01T12:00:00Z", description: "d", community_members: [{ count: 3 }] }];
  mocks.state.events = [{ id: "e1", title: "Soirée de bienvenue", category: "social", city: "Montréal", event_date: "2099-01-01T18:00:00Z", visibility: "public", created_at: "2024-01-01T12:00:00Z", timezone: "America/Toronto", event_attendees: [{ count: 1 }] }];
  mocks.state.news = [{ id: "n1", title: "Nouvelle règle d'immigration", url: "https://exemple.test/a", source: "IRCC", category: "general", published_at: "2024-01-01T12:00:00Z", summary: "résumé" }];
  onLine = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => onLine);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const reconnect = () => {
  onLine = true;
  mocks.state.failReads = false;
  act(() => { window.dispatchEvent(new Event("online")); });
};

describe("PostsFeed — premier chargement raté", () => {
  it("affiche une erreur avec Réessayer (pas « Aucune publication »), puis se recharge tout seul au retour du réseau", async () => {
    window.dispatchEvent(new Event("offline"));
    await act(async () => { render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} />); });
    await screen.findByRole("alert");
    expect(screen.getByText(/hors ligne/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucune publication/)).toBeNull();
    reconnect();
    await screen.findByText("Bonjour la communauté");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("le bouton Réessayer relance le chargement", async () => {
    const user = userEvent.setup();
    onLine = true;
    await act(async () => { render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} />); });
    await user.click(await screen.findByRole("button", { name: /Réessayer/ }));
    mocks.state.failReads = false;
    await user.click(screen.getByRole("button", { name: /Réessayer/ }));
    await screen.findByText("Bonjour la communauté");
  });
});

describe("CommunitiesTab — liste ratée", () => {
  it("erreur avec Réessayer plutôt que « pas encore de communauté », rechargée au retour du réseau", async () => {
    window.dispatchEvent(new Event("offline"));
    render(<CommunitiesTab currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} />);
    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByText(/pas encore de communauté/)).toBeNull();
    reconnect();
    await screen.findAllByText("Groupe Montréal", {}, { timeout: 3000 });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("EventsTab — liste ratée", () => {
  it("erreur avec Réessayer plutôt que « aucun événement », rechargée au retour du réseau", async () => {
    window.dispatchEvent(new Event("offline"));
    render(<EventsTab currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} />);
    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByText(/aucun événement/i)).toBeNull();
    reconnect();
    await screen.findAllByText("Soirée de bienvenue", {}, { timeout: 3000 });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ImmigrationNewsView — chargement raté", () => {
  it("erreur avec Réessayer plutôt que « Aucune actualité indexée », rechargée au retour du réseau", async () => {
    window.dispatchEvent(new Event("offline"));
    render(<ImmigrationNewsView onBack={() => {}} onError={vi.fn()} currentUser={{ id: "u1", name: "Moi" }} />);
    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByText(/Aucune actualité/)).toBeNull();
    reconnect();
    await screen.findAllByText(/Nouvelle règle d'immigration/, {}, { timeout: 3000 });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
