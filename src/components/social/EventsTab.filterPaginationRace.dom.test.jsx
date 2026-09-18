import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Bug identifié à l'audit filtres (EventsTab.jsx) : "Charger plus" (loadMore)
// et le rechargement déclenché par un changement de filtre (search/
// filterCity/filterCategory/filterDateRange, effet débounce de 300ms)
// n'étaient reliés par AUCUN jeton commun. Scénario concret : l'utilisateur
// clique "Charger plus" (page suivante de la liste NON filtrée), puis, avant
// que cette page n'arrive, tape une ville dans le filtre. L'effet de filtre
// recharge alors "events" en entier avec les nouveaux critères — mais si la
// réponse de "Charger plus" (toujours en vol, sur l'ANCIEN filtre) arrive
// ENSUITE, elle s'ajoutait quand même via setEvents(prev => [...prev, ...rows])
// par-dessus la liste fraîchement filtrée, faisant réapparaître un événement
// qui ne correspond plus au filtre actif.
//
// Ce test simule exactement cette course : la page "Charger plus" reste en
// attente (promesse non résolue) pendant que le filtre ville change et que sa
// propre requête (plus rapide) se termine, puis ne résout la page en retard
// qu'après — elle ne doit jamais apparaître dans la liste affichée.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), events: null }));

function makeGenericChain(responder) {
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

// Chaîne dédiée à la table "events" : distingue la requête de liste
// (initiale ou rechargée par un filtre) de la page "Charger plus" (seule à
// ajouter un .or() de curseur "event_date.gt...") pour pouvoir contrôler
// indépendamment le moment où chacune se résout.
function makeEventsChain(state) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "is", "in", "ilike", "or", "gte", "lte"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.then = (resolve, reject) => {
    const isCursorPage = calls.some(([m, args]) => m === "or" && String(args[0]).includes("event_date.gt"));
    const cityCall = calls.find(([m]) => m === "ilike");
    const isParisFiltered = Boolean(cityCall && String(cityCall[1][1]).includes("Paris"));
    if (isCursorPage) {
      return state.loadMorePromise.then(resolve, reject);
    }
    if (isParisFiltered) {
      return Promise.resolve({ data: state.parisEvents, error: null, count: state.parisEvents.length }).then(resolve, reject);
    }
    return Promise.resolve({ data: state.initialEvents, error: null, count: 25 }).then(resolve, reject);
  };
  return chain;
}

const genericResponders = {
  event_attendees: () => ({ data: [], error: null }),
  community_members: () => ({ data: [], error: null }),
  likes: () => ({ data: [], error: null }),
  profiles: (calls, kind) => (kind === "single" ? { data: { name: "Organisateur" }, error: null } : { data: [], error: null }),
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

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();

function makeEvent(id, title, city) {
  return {
    id, title, description: "", category: "rencontres", cover_url: null,
    event_date: FUTURE, duration_minutes: null, city, location: null,
    max_participants: null, visibility: "public", community_id: null,
    created_by: null, canceled_at: null, timezone: null, event_participant_count: 0,
  };
}

let loadMoreResolve;

beforeEach(() => {
  vi.clearAllMocks();
  const state = {
    initialEvents: [makeEvent("e1", "Événement initial Montréal", "Montréal")],
    parisEvents: [makeEvent("e-paris", "Événement Paris", "Paris")],
    loadMorePromise: new Promise((resolve) => { loadMoreResolve = resolve; }),
  };
  mocks.fromMock.mockImplementation((table) => {
    if (table === "events") return makeEventsChain(state);
    return makeGenericChain((calls, kind) => (genericResponders[table] ? genericResponders[table](calls, kind) : { data: [], error: null, count: 0 }));
  });
});

describe("EventsTab — course entre \"Charger plus\" et un changement de filtre", () => {
  it("n'ajoute pas une page en retard de l'ancien filtre après qu'un nouveau filtre a rechargé la liste", async () => {
    render(
      <ImageLightboxProvider>
        <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={vi.fn()} />
      </ImageLightboxProvider>
    );

    // Liste initiale (non filtrée) chargée, hasMore=true (count=25 > PAGE_SIZE).
    await screen.findAllByText("Événement initial Montréal");
    const loadMoreBtn = await screen.findByRole("button", { name: "Charger plus" });

    // Déclenche loadMore() avec l'ANCIEN filtre (ville vide) — reste en vol
    // (loadMorePromise non résolue).
    fireEvent.click(loadMoreBtn);

    // Ouvre les filtres et filtre par "Paris" pendant que la page précédente
    // est toujours en attente.
    fireEvent.click(screen.getByRole("button", { name: "Filtres" }));
    const cityInput = screen.getByLabelText("Filtrer par ville");
    fireEvent.change(cityInput, { target: { value: "Paris" } });

    // Le rechargement filtré (debounce 300ms) remplace la liste affichée.
    await screen.findByText("Événement Paris");
    expect(screen.queryByText("Événement initial Montréal")).not.toBeInTheDocument();

    // La page "Charger plus" de l'ancien filtre arrive maintenant, en retard.
    await act(async () => {
      loadMoreResolve({ data: [makeEvent("e-stale", "Événement en retard (ancien filtre)", "Montréal")], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Elle ne doit jamais polluer la liste filtrée sur "Paris" affichée.
    expect(screen.queryByText("Événement en retard (ancien filtre)")).not.toBeInTheDocument();
    expect(screen.getByText("Événement Paris")).toBeInTheDocument();
  });
});
