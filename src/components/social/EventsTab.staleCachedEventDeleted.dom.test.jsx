import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Bug identifié à l'audit "Mes événements" (ProfileTab.jsx, via
// SocialShell.jsx) : cette liste n'est rechargée qu'au montage de l'onglet
// Profil, jamais en temps réel. Si l'organisateur supprime entièrement un
// événement (pas une simple annulation, qui laisse canceled_at renseigné)
// pendant que "Mes événements" reste affiché avec cette entrée encore en
// cache côté client, cliquer dessus (onOpenEvents(ev.id) -> initialEventId
// -> goDetail()) appelait .single() sur un id qui n'existe plus en base :
// la requête échoue (0 ligne), et comme la vue "detail" est déjà affichée
// avec event=null à cet instant, EventsTab ne rendait qu'un SkeletonCard
// (if (!event) return <SkeletonCard />) pour toujours — aucun bouton retour
// visible, seul un toast d'erreur qui disparaît tout seul. goDetail()
// ramène désormais à l'accueil de l'onglet Événements dans ce cas.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

function makeGenericChain(responder) {
  const chain = {};
  ["select", "eq", "order", "limit", "is", "in", "ilike", "or", "gte", "lte"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(responder("maybeSingle")));
  chain.single = vi.fn(() => Promise.resolve(responder("single")));
  chain.then = (resolve, reject) => Promise.resolve(responder("then")).then(resolve, reject);
  return chain;
}

// La ligne a disparu de la base (supprimée par l'organisateur) : .single()
// renvoie l'erreur PostgREST réelle pour "0 ligne trouvée".
function makeDeletedEventChain() {
  return makeGenericChain((kind) =>
    kind === "single"
      ? { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }
      : { data: [], error: null, count: 0 }
  );
}

const genericResponders = {
  event_attendees: () => ({ data: [], error: null }),
  event_invitations: () => ({ data: [], error: null }),
  community_members: () => ({ data: [], error: null }),
  likes: () => ({ data: [], error: null }),
};

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ createSignedUrls: vi.fn(() => Promise.resolve({ data: [] })) })) },
  },
}));

import EventsTab from "./EventsTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fromMock.mockImplementation((table) => {
    if (table === "events") return makeDeletedEventChain();
    return makeGenericChain((kind) => (genericResponders[table] ? genericResponders[table](kind) : { data: [], error: null, count: 0 }));
  });
});

describe("EventsTab — ouverture d'un événement référencé par 'Mes événements' mais supprimé entre-temps", () => {
  it("revient à l'accueil des événements au lieu de rester bloqué sur un chargement infini", async () => {
    const onError = vi.fn();
    const onConsumedInitial = vi.fn();
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ImageLightboxProvider>
        <EventsTab
          currentUser={{ id: "u1", name: "Testeur" }}
          onError={onError}
          initialEventId="deleted-event"
          onConsumedInitial={onConsumedInitial}
        />
      </ImageLightboxProvider>
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de charger cet événement."));

    // De retour sur l'accueil de l'onglet Événements, pas bloqué sur le
    // SkeletonCard du détail.
    expect(await screen.findByText("🎉 Événements Baobab")).toBeInTheDocument();

    consoleErrSpy.mockRestore();
  });
});
