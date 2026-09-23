import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Test d'intégration réelle du correctif "double-clic sur Supprimer un
// message de discussion d'événement en modération" (EventsTab.jsx/
// EventCommentsSection.jsx) — même famille que le correctif équivalent côté
// communautés (CommunitiesTab.moderation-delete.dom.test.jsx, commit
// bbc020b).
//
// Contexte : un organisateur/co-organisateur/modérateur d'événement peut
// supprimer le message d'un AUTRE participant (policy RLS "Auteur ou
// moderateur supprime un commentaire", supabase-events-v2.sql, is_event_mod
// — voir isEventMod, lib/events/permissions.js). Avant ce correctif,
// handleDeleteComment (comme handleDeleteEvent) n'avait aucune garde
// anti-double-appel — contrairement à handleJoin/handleLeave (même fichier),
// qui en ont déjà une pour exactement la même raison : un second DELETE sur
// une ligne déjà supprimée ne renvoie pas d'erreur PostgREST, donc il
// "réussit" aussi silencieusement.
//
// Le bouton "Supprimer" de la ConfirmModal ne protège pas ce cas : son
// onConfirm (EventCommentsSection.jsx) déclenche onDelete sans attendre sa
// promesse puis referme aussitôt la modale — l'état "confirming" de
// ConfirmModal ne couvre donc pas la durée réelle de l'appel réseau. Tant que
// celui-ci n'est pas résolu, le message reste affiché avec son bouton
// "Supprimer ce message" actif : un modérateur qui reclique dessus pendant
// que la première suppression est encore en vol relance handleDeleteComment
// une seconde fois pour le même message.
//
// Ce test monte le VRAI EventsTab (pas une réimplémentation) en tant que
// modérateur consultant la discussion d'un événement créé par un AUTRE
// membre, ouvre l'onglet "Discussion", confirme la suppression du message une
// première fois (requête réseau maintenue en vol), reclique "Supprimer ce
// message" + confirme une seconde fois pendant que la première est toujours
// en vol, puis vérifie qu'un seul DELETE est réellement parti vers
// event_comments.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), channelCalls: [] }));

function makeChain(responder) {
  const calls = [];
  const chain = {};
  ["select", "eq", "order", "limit", "is", "in", "ilike", "or", "gte", "lte", "match", "contains", "not", "update", "insert"].forEach((m) => {
    chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder(calls, "maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder(calls, "single")));
  chain.then = (resolve, reject) => Promise.resolve(responder(calls, "then")).then(resolve, reject);
  return chain;
}

// Builder dédié à event_comments : rend le SELECT (chargement de la
// discussion) statique, et le DELETE contrôlable (une promesse par appel,
// résolue manuellement par le test) pour pouvoir observer précisément
// combien d'appels réseau réels partent.
function makeEventCommentsBuilder({ comment, deleteCalls }) {
  const builder = {};
  ["select", "eq", "order"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) => Promise.resolve({ data: [comment], error: null }).then(resolve, reject);
  builder.delete = vi.fn(() => {
    const delBuilder = {};
    delBuilder.eq = vi.fn(() => {
      let resolveFn;
      const promise = new Promise((res) => { resolveFn = res; });
      deleteCalls.push(resolveFn);
      return { then: (resolve, reject) => promise.then(resolve, reject) };
    });
    return delBuilder;
  });
  return builder;
}

const EVENT_ROW = {
  id: "e1",
  title: "Brunch complet",
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
  created_by: "author1",
  canceled_at: null,
  timezone: null,
};

const COMMENT = {
  id: "cmt1",
  event_id: "e1",
  author_id: "author1",
  body: "Message à modérer",
  created_at: new Date().toISOString(),
  profiles: { name: "Auteur" },
};

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn((name) => {
      const ch = {};
      ch.on = vi.fn((type, config, handler) => { mocks.channelCalls.push({ name, type, config, handler }); return ch; });
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
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

describe("EventsTab — modération : garde anti-double-clic sur la suppression d'un message de discussion", () => {
  let deleteCalls;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channelCalls.length = 0;
    deleteCalls = [];

    const tableResponders = {
      event_attendees: () => ({ data: [], error: null }),
      community_members: () => ({ data: [], error: null }),
      likes: () => ({ data: [], error: null }),
      events: (calls, kind) => (kind === "single" ? { data: EVENT_ROW, error: null } : { data: [], error: null, count: 0 }),
      profiles: (calls, kind) => (kind === "single" ? { data: { name: "Auteur" }, error: null } : { data: [], error: null }),
      // Modérateur d'événement — organizer/co_organizer/moderator (isEventMod)
      // — mais pas nécessairement organisateur/créateur (created_by=author1).
      event_staff: () => ({ data: { role: "moderator" }, error: null }),
      event_media: () => ({ data: [], error: null }),
      event_reports: () => ({ data: [], error: null }),
    };

    mocks.fromMock.mockImplementation((table) => {
      if (table === "event_comments") return makeEventCommentsBuilder({ comment: COMMENT, deleteCalls });
      return makeChain((calls, kind) => (tableResponders[table] ? tableResponders[table](calls, kind) : { data: [], error: null, count: 0 }));
    });
  });

  it("un second \"Supprimer\" pendant que la première suppression est en vol ne déclenche pas un second DELETE", async () => {
    const user = userEvent.setup();
    render(
      <ImageLightboxProvider>
        <EventsTab
          currentUser={{ id: "mod1", name: "Modérateur" }}
          onError={vi.fn()}
          initialEventId="e1"
          onConsumedInitial={vi.fn()}
        />
      </ImageLightboxProvider>
    );

    const discussionTab = await screen.findByRole("button", { name: "Discussion" });
    await user.click(discussionTab);

    await screen.findByText("Message à modérer");

    // Premier clic confirmé : lance handleDeleteComment, le DELETE reste en
    // vol (non résolu) donc le message est toujours affiché ensuite.
    await user.click(screen.getByRole("button", { name: "Supprimer ce message" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(deleteCalls.length).toBe(1));

    // Le message est toujours affiché (le premier DELETE n'a pas encore
    // répondu) avec son bouton de suppression toujours actif.
    expect(screen.getByText("Message à modérer")).toBeInTheDocument();

    // Second clic confirmé (double-clic/tap rapide) sur le MÊME message
    // pendant que la première suppression est encore en vol : ne doit PAS
    // déclencher un second DELETE réseau.
    await user.click(screen.getByRole("button", { name: "Supprimer ce message" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));
    expect(deleteCalls.length).toBe(1); // toujours 1, pas 2

    // Résout le DELETE en vol : le message disparaît normalement.
    deleteCalls[0]({ error: null });
    await waitFor(() => expect(screen.queryByText("Message à modérer")).not.toBeInTheDocument());

    // Toujours un seul DELETE parti au total malgré les deux confirmations.
    expect(deleteCalls.length).toBe(1);
  });
});
