import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// Audit réseau (6 oct. 2026) : après une longue mise en veille du téléphone, le
// navigateur ne voit passer AUCUN évènement `online` (la connexion reste « en
// ligne ») mais le système a coupé le websocket Realtime : les messages et
// notifications reçus pendant la veille n'étaient jamais rattrapés (seul
// `online` déclenchait un refetch). Ce test monte le VRAI SocialShell, fait
// arriver un message et une notification « pendant la veille » côté serveur,
// puis simule le retour de visibilité après > 60 s : l'aperçu/badge de
// non-lus doit se mettre à jour et la liste des notifications être relue sans rechargement.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

const ME = "me-0000-4000-8000-000000000000";
const OTHER = "00000000-0000-4000-8000-000000000001";
const KEY = [ME, OTHER].sort().join("__");

const server = { messages: [], notifications: [] };
let messageReads = 0;
let notificationReads = 0;

function thenable(getResult) {
  return { then: (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject) };
}

function makeBuilder(getResult) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "range", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.limit = vi.fn(() => thenable(getResult));
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject);
  return builder;
}

vi.mock("./../supabaseClient", () => ({
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
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";

let now;
let visibility;
function setVisibility(state) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.clearAllMocks();
  server.messages = [];
  server.notifications = [];
  messageReads = 0;
  notificationReads = 0;
  now = Date.now();
  visibility = "visible";
  vi.spyOn(Date, "now").mockImplementation(() => now);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  mocks.fromMock.mockImplementation((table) => {
    if (table === "messages") return makeBuilder(() => { messageReads += 1; return { data: server.messages, error: null }; });
    if (table === "notifications") return makeBuilder(() => { notificationReads += 1; return { data: server.notifications, error: null, count: server.notifications.length }; });
    return makeBuilder(() => ({ data: [], error: null, count: 0 }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete document.visibilityState;
});

function renderShell() {
  const matches = [{ id: OTHER, name: "Awa" }];
  return render(
    <SocialShell currentUser={{ id: ME, name: "Moi" }} setView={vi.fn()} handleSignOut={vi.fn()} getMatches={() => matches} />
  );
}

describe("SocialShell — rattrapage après reprise d'un onglet/téléphone en veille", () => {
  it("un message et une notification reçus pendant la veille apparaissent au retour (sans évènement online)", async () => {
    renderShell();
    await waitFor(() => expect(messageReads).toBeGreaterThan(0));
    await waitFor(() => expect(notificationReads).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /Notifications \(\d+ non lu/ })).toBeNull();

    // Pendant la veille : un message de Awa + une notification de nouvel abonné arrivent côté serveur.
    server.messages = [{
      id: 1, match_key: KEY, from_id: OTHER, kind: "text", text: "Coucou", media_path: null, media_meta: null,
      created_at: new Date().toISOString(), read_at: null, deleted_at: null, deleted_for: [],
    }];
    server.notifications = [{
      id: "n1", type: "new_follower", community_id: null, target_type: "profile", target_id: OTHER, actor_id: OTHER,
      read_at: null, created_at: new Date().toISOString(), actor: { name: "Awa", avatar_url: null },
    }];

    const messageReadsBefore = messageReads;
    const notificationReadsBefore = notificationReads;
    act(() => setVisibility("hidden"));
    now += 5 * 60_000;
    act(() => setVisibility("visible"));

    await waitFor(() => expect(messageReads).toBeGreaterThan(messageReadsBefore));
    await waitFor(() => expect(notificationReads).toBeGreaterThan(notificationReadsBefore));
    await screen.findByRole("button", { name: /Notifications \(1 non lus\)/ });
  });

  it("aller-retour rapide (< 60 s) : aucun refetch", async () => {
    renderShell();
    await waitFor(() => expect(messageReads).toBeGreaterThan(0));
    await waitFor(() => expect(notificationReads).toBeGreaterThan(0));
    const m = messageReads;
    const n = notificationReads;
    act(() => setVisibility("hidden"));
    now += 10_000;
    act(() => setVisibility("visible"));
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(messageReads).toBe(m);
    expect(notificationReads).toBe(n);
  });
});
