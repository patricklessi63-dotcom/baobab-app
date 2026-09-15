import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit blocage (comportement CLIENT immédiat au clic sur "Bloquer") :
// la bannière "⭐ N personne(s) t'a ajouté en favori" du menu de
// notifications (incomingFavoritesCount, voir SocialShell.jsx) comptait
// TOUTES les lignes "favorites" reçues, y compris celles venant d'une
// personne déjà bloquée — contrairement à getAdmirers()/favoriteProfiles,
// qui excluent déjà les deux sens du blocage. Un blocage n'efface pas la
// ligne "favorites" correspondante, donc ce compteur restait faussé même
// après un rechargement complet (pas seulement un problème de réactivité
// en cours de session). Corrigé en gardant la liste brute des from_id
// (incomingFavoriteFromIds) et en dérivant le compte affiché par un filtre
// sur blockedIds, recalculé à chaque rendu comme le reste de l'app.
// Ce test vérifie les deux angles : le filtrage au chargement initial, et
// la réactivité immédiate quand blockedIds change en cours de session
// (sans nouvelle requête réseau) — exactement le scénario audité : on vient
// de bloquer quelqu'un, son contenu ne doit plus apparaître sans réattendre
// un rechargement complet.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
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

describe("SocialShell — badge favoris reçus exclut les personnes bloquées", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Deux favoris reçus : "blocked1" (sera bloqué) et "friend1" (pas bloqué).
    // Même builder générique réutilisé pour tout autre appel à "favorites"
    // (ex. mes propres favoris envoyés) : les champs attendus (to_id/profile)
    // sont simplement absents de ces lignes, sans effet sur ce test.
    mocks.fromMock.mockImplementation((table) => {
      if (table === "favorites") {
        return makeQueryBuilder({ data: [{ from_id: "blocked1" }, { from_id: "friend1" }], error: null });
      }
      return makeQueryBuilder();
    });
  });

  it("exclut dès le chargement initial une personne déjà bloquée de la liste des favoris reçus", async () => {
    render(
      <SocialShell
        currentUser={{ id: "u1", name: "Test" }}
        setView={vi.fn()}
        handleSignOut={vi.fn()}
        blockedIds={new Set(["blocked1"])}
      />
    );

    const user = userEvent.setup();
    const bell = await screen.findByRole("button", { name: "Notifications" });
    await user.click(bell);

    // Un seul favori restant (friend1) une fois blocked1 exclu : singulier,
    // "1 personne" — pas "2 personnes". La bannière est rendue à deux
    // endroits (menu de notifications du header + panneau du Fil) d'où
    // getAllByText plutôt que getByText.
    await waitFor(() => expect(screen.getAllByText(/1 personne t'a ajouté en favori/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/2 personnes/).length).toBe(0);
  });

  it("fait disparaître immédiatement un favori reçu de la bannière dès que blockedIds change, sans nouvelle requête", async () => {
    const user = userEvent.setup();
    // Même référence de currentUser entre les deux rendus (sinon React
    // relancerait les effets dépendant de [currentUser] à chaque rerender,
    // ce qui refetcherait "favorites" pour une tout autre raison que le
    // changement de blockedIds testé ici).
    const currentUser = { id: "u1", name: "Test" };
    const { rerender } = render(
      <SocialShell
        currentUser={currentUser}
        setView={vi.fn()}
        handleSignOut={vi.fn()}
        blockedIds={new Set()}
      />
    );

    const bell = await screen.findByRole("button", { name: "Notifications" });
    await user.click(bell);

    // Avant tout blocage : les deux favoris reçus comptent (rendu à deux
    // endroits, voir le test précédent).
    await waitFor(() => expect(screen.getAllByText(/2 personnes t'a ajouté en favori/).length).toBeGreaterThan(0));

    const favoritesCallsBefore = mocks.fromMock.mock.calls.filter(([t]) => t === "favorites").length;

    // On vient de bloquer "blocked1" en cours de session (App.jsx met
    // blockedIds à jour de façon optimiste, voir performBlock) : la prop
    // change, sans rechargement de page ni nouvelle requête "favorites".
    rerender(
      <SocialShell
        currentUser={currentUser}
        setView={vi.fn()}
        handleSignOut={vi.fn()}
        blockedIds={new Set(["blocked1"])}
      />
    );

    await waitFor(() => expect(screen.getAllByText(/1 personne t'a ajouté en favori/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/2 personnes/).length).toBe(0);

    // Aucune requête réseau supplémentaire vers "favorites" : le filtrage
    // est purement dérivé de blockedIds côté client, pas d'un refetch.
    const favoritesCallsAfter = mocks.fromMock.mock.calls.filter(([t]) => t === "favorites").length;
    expect(favoritesCallsAfter).toBe(favoritesCallsBefore);
  });
});
