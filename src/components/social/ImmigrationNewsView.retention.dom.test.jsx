import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { isNewsRecent, NEWS_MAX_AGE_DAYS, NEWS_RESUME_RELOAD_MS } from "../../lib/immigrationNewsRetention";

// Demande du propriétaire (27/11/2026) : le fil « Actualités » se met à jour tous les jours et les
// anciennes actualités disparaissent chaque fin de semaine. Côté serveur : SQL-46 (purge du dimanche,
// testée par src/native/immigrationNewsRetention.test.js). Côté app : jamais d'actualité de plus de
// 14 jours dans le fil (même si la purge n'a pas tourné), favoris toujours consultables, et
// rechargement au retour dans l'app après 30 min d'absence.

const mocks = vi.hoisted(() => ({ state: { news: [], favorites: [] }, reads: 0 }));

function makeBuilder(table) {
  const b = {};
  ["select", "eq", "order", "limit", "delete", "insert"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.then = (resolve, reject) => {
    if (table === "immigration_news") mocks.reads += 1;
    const rows = table === "immigration_news" ? mocks.state.news
      : table === "immigration_news_favorites" ? mocks.state.favorites : [];
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  };
  return b;
}

vi.mock("../../supabaseClient", () => ({ supabase: { from: vi.fn((table) => makeBuilder(table)) } }));

import ImmigrationNewsView from "./ImmigrationNewsView";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-27T12:00:00Z");
let clock = NOW;
const news = (id, title, daysAgo) => ({
  id, title, summary: "", category: "general", source: "ircc", source_label: "IRCC",
  source_url: `https://www.canada.ca/${id}`, published_at: new Date(NOW - daysAgo * DAY).toISOString(),
});
const ME = { id: "u1", name: "Moi" };

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  clock = NOW;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  mocks.state = { news: [], favorites: [] };
  mocks.reads = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

describe("isNewsRecent", () => {
  it("garde jusqu'à 14 jours, masque au-delà ; date illisible gardée", () => {
    expect(NEWS_MAX_AGE_DAYS).toBe(14);
    expect(isNewsRecent(news("a", "a", 13.9), NOW)).toBe(true);
    expect(isNewsRecent(news("a", "a", 14), NOW)).toBe(true);
    expect(isNewsRecent(news("a", "a", 14.1), NOW)).toBe(false);
    expect(isNewsRecent({ published_at: "pas une date" }, NOW)).toBe(true);
  });
});

describe("ImmigrationNewsView — fraîcheur du fil", () => {
  it("le fil n'affiche pas une actualité de plus de 14 jours ; le filtre Favoris la montre si elle est en favori", async () => {
    mocks.state.news = [news("n1", "Nouvelles du jour", 1), news("n2", "Annonce de la semaine passée", 9), news("n3", "Vieille annonce", 30)];
    mocks.state.favorites = [{ news_id: "n3" }];
    render(<ImmigrationNewsView onBack={() => {}} onError={vi.fn()} currentUser={ME} />);
    await screen.findByText("Nouvelles du jour");
    expect(screen.getByText("Annonce de la semaine passée")).toBeTruthy();
    expect(screen.queryByText("Vieille annonce")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Afficher uniquement mes favoris" }));
    expect(await screen.findByText("Vieille annonce")).toBeTruthy();
    expect(screen.queryByText("Nouvelles du jour")).toBeNull();
  });

  it("uniquement d'anciennes actualités en base : « Aucune actualité récente », pas de liste vide muette", async () => {
    mocks.state.news = [news("n3", "Vieille annonce", 30)];
    render(<ImmigrationNewsView onBack={() => {}} onError={vi.fn()} currentUser={ME} />);
    await screen.findByText(/Aucune actualité récente/);
    expect(screen.queryByText("Vieille annonce")).toBeNull();
  });

  it("retour dans l'app après plus de 30 min : les actualités du jour sont rechargées, sans « Chargement... »", async () => {
    mocks.state.news = [news("n1", "Nouvelles d'hier", 1)];
    render(<ImmigrationNewsView onBack={() => {}} onError={vi.fn()} currentUser={ME} />);
    await screen.findByText("Nouvelles d'hier");
    expect(mocks.reads).toBe(1);

    // Absence courte (5 min) : rien n'est relancé.
    act(() => { setVisibility("hidden"); });
    clock += 5 * 60 * 1000;
    act(() => { setVisibility("visible"); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.reads).toBe(1);

    // Le lendemain : une nouvelle actualité est en base, l'app revient au premier plan.
    mocks.state.news = [news("n4", "Nouvelles du lendemain", 0), news("n1", "Nouvelles d'hier", 1)];
    act(() => { setVisibility("hidden"); });
    clock += NEWS_RESUME_RELOAD_MS + DAY;
    act(() => { setVisibility("visible"); });
    expect(await screen.findByText("Nouvelles du lendemain")).toBeTruthy();
    expect(mocks.reads).toBe(2);
    expect(screen.queryByText("Chargement...")).toBeNull();
  });
});
