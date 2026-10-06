import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit réseau (6 oct. 2026) : si la connexion tombe PENDANT l'appel
// join_event(), l'inscription est peut-être déjà enregistrée. handleJoin()
// affichait « Impossible de rejoindre cet événement. » et laissait le bouton
// « Participer » — un second clic relance join_event(), qui recompte les
// « going » en s'y incluant : sur un événement complet, la personne pouvait être
// rétrogradée en liste d'attente. On relit maintenant le statut réel.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn(), state: { serverStatus: null, probeFails: false } }));

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();
const EVENT_A = {
  id: "eA", title: "Soirée A", description: "", category: "rencontres", cover_url: null,
  event_date: FUTURE, duration_minutes: null, city: "Montréal", location: null,
  max_participants: 10, visibility: "public", community_id: null,
  created_by: null, canceled_at: null, timezone: null, event_participant_count: 0,
};
const NET = { message: "TypeError: Failed to fetch", code: "" };

function makeGenericChain(responder) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "range", "is", "in", "ilike", "or", "gte", "lte", "match", "contains", "not"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder(calls, "maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder(calls, "single")));
  chain.then = (resolve, reject) => Promise.resolve(responder(calls, "then")).then(resolve, reject);
  return chain;
}

function makeEventsChain() {
  const chain = {};
  ["select", "eq", "order", "limit", "range", "is", "in", "ilike", "or", "gte", "lte"].forEach((m) => { chain[m] = vi.fn(() => chain); });
  chain.single = vi.fn(() => Promise.resolve({ data: EVENT_A, error: null }));
  chain.then = (resolve, reject) => Promise.resolve({ data: [EVENT_A], error: null, count: 1 }).then(resolve, reject);
  return chain;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    rpc: mocks.rpcMock,
    storage: { from: vi.fn(() => ({ createSignedUrls: vi.fn(() => Promise.resolve({ data: [] })) })) },
  },
}));

import EventsTab from "./EventsTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.serverStatus = null;
  mocks.state.probeFails = false;
  mocks.fromMock.mockImplementation((table) => {
    if (table === "events") return makeEventsChain();
    return makeGenericChain((calls, kind) => {
      if (table === "event_attendees" && kind === "maybeSingle") {
        // Relecture ciblée du statut de la personne (après la coupure).
        if (mocks.state.probeFails) return { data: null, error: NET };
        return { data: mocks.state.serverStatus ? { status: mocks.state.serverStatus } : null, error: null };
      }
      if (table === "profiles" && kind === "single") return { data: { name: "Organisateur" }, error: null };
      return { data: kind === "single" || kind === "maybeSingle" ? null : [], error: null, count: 0 };
    });
  });
  // join_event : la requête est partie et exécutée, mais la réponse est perdue.
  mocks.rpcMock.mockResolvedValue({ data: null, error: NET });
});

async function openEvent(user, onError) {
  render(
    <ImageLightboxProvider>
      <EventsTab currentUser={{ id: "u1", name: "Testeur" }} onError={onError} />
    </ImageLightboxProvider>
  );
  await screen.findAllByText("Soirée A");
  await user.click(screen.getAllByText("Soirée A")[0]);
  return screen.findByRole("button", { name: "🎟️ Participer" });
}

describe("EventsTab — participation coupée en plein vol", () => {
  it("inscription enregistrée mais réponse perdue : le vrai statut est relu, pas d'erreur trompeuse ni de bouton Participer relançable", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const join = await openEvent(user, onError);
    mocks.state.serverStatus = "going";
    await user.click(join);
    await waitFor(() => expect(screen.queryByRole("button", { name: "🎟️ Participer" })).toBeNull());
    expect(onError).not.toHaveBeenCalled();
  });

  it("vérification impossible (réseau toujours coupé) : message d'erreur habituel", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const join = await openEvent(user, onError);
    mocks.state.probeFails = true;
    await user.click(join);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de rejoindre cet événement."));
  });

  it("coupure alors qu'une ancienne ligne « interested » existe : l'appel n'a pas abouti, l'erreur est affichée (pas d'échec avalé en silence)", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const join = await openEvent(user, onError);
    mocks.state.serverStatus = "interested";
    await user.click(join);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de rejoindre cet événement."));
  });

  it("liste d'attente enregistrée mais réponse perdue : le statut « waitlisted » est relu sans erreur", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const join = await openEvent(user, onError);
    mocks.state.serverStatus = "waitlisted";
    await user.click(join);
    await waitFor(() => expect(screen.queryByRole("button", { name: "🎟️ Participer" })).toBeNull());
    expect(onError).not.toHaveBeenCalled();
  });

  it("requête jamais partie (rien d'enregistré) : message d'erreur habituel, le bouton reste disponible", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const join = await openEvent(user, onError);
    mocks.state.serverStatus = null;
    await user.click(join);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de rejoindre cet événement."));
    expect(screen.getByRole("button", { name: "🎟️ Participer" })).toBeInTheDocument();
  });
});
