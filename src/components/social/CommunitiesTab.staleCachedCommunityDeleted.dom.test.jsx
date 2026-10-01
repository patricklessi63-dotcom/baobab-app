import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Bug identifié à l'audit (même famille que goDetail() dans EventsTab.jsx,
// corrigé en a2a97dd) : "Mes communautés" (ProfileTab.jsx, via
// SocialShell.jsx) n'est rechargé qu'au montage de l'onglet Profil, jamais en
// temps réel. Si l'owner supprime entièrement sa communauté (via
// handleDeleteCommunity) pendant que "Mes communautés" (ou la liste de
// découverte, elle aussi potentiellement périmée) reste affichée avec cette
// entrée en cache côté client, cliquer dessus (initialCommunityId ->
// goDetail()) appelait .single() sur un id qui n'existe plus en base : la
// requête échoue (0 ligne), et comme la vue "detail" est déjà affichée avec
// community=null à cet instant, CommunitiesTab ne rendait qu'un SkeletonCard
// (if (!community) return <SkeletonCard />) pour toujours — aucun bouton
// retour visible, seul un toast d'erreur qui disparaît tout seul. goDetail()
// ramène désormais à la liste des communautés dans ce cas.

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

// La ligne a disparu de la base (supprimée par l'owner) : .single() renvoie
// l'erreur PostgREST réelle pour "0 ligne trouvée".
function makeDeletedCommunityChain() {
  return makeGenericChain((kind) =>
    kind === "single"
      ? { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }
      : { data: [], error: null, count: 0 }
  );
}

const genericResponders = {
  community_members: () => ({ data: [], error: null, count: 0 }),
  community_join_requests: () => ({ data: [], error: null, count: 0 }),
};

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fromMock.mockImplementation((table) => {
    if (table === "communities") return makeDeletedCommunityChain();
    return makeGenericChain((kind) => (genericResponders[table] ? genericResponders[table](kind) : { data: [], error: null, count: 0 }));
  });
});

describe("CommunitiesTab — ouverture d'une communauté référencée par 'Mes communautés' mais supprimée entre-temps", () => {
  it("revient à la liste des communautés au lieu de rester bloqué sur un chargement infini", async () => {
    const onError = vi.fn();
    const onConsumedInitial = vi.fn();
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <CommunitiesTab
        currentUser={{ id: "u1", name: "Testeur" }}
        onError={onError}
        initialCommunityId="deleted-community"
        onConsumedInitial={onConsumedInitial}
        blockedIds={new Set()}
      />
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de charger cette communauté."));

    // De retour sur la liste des communautés, pas bloqué sur le SkeletonCard
    // du détail.
    expect(await screen.findByText("🌍 Communautés Baobab")).toBeInTheDocument();

    consoleErrSpy.mockRestore();
  });
});
