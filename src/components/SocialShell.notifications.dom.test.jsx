import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Test d'intégration réelle du correctif "Charger plus" (panneau de
// notifications de SocialShell.jsx/NotificationsDropdown.jsx) — audit
// pagination du 15 sept. Avant ce correctif, rien n'empêchait un
// double-clic/tap rapide sur "Charger plus" de déclencher DEUX
// fetchNotifications() concurrents (limite 20->40 puis 40->60) sans le
// moindre jeton de requête : si la réponse à la PLUS PETITE limite arrivait
// après celle de la plus grande (ordre réseau non garanti), elle écrasait la
// liste affichée et notifHasMore avec des données plus courtes/anciennes —
// des notifications déjà visibles disparaissaient jusqu'au clic suivant.
// Ce test monte le VRAI SocialShell (pas une réimplémentation) et vérifie
// que le bouton se désactive pendant la requête, empêchant qu'un second
// clic pendant que la première est en vol ne déclenche une deuxième requête.

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

// Builder dédié à la table "notifications" : chaque appel à .limit() (dernier
// maillon réel de la requête dans SocialShell.jsx avant le .then()) enregistre
// une promesse que le test résout manuellement, pour contrôler précisément le
// nombre d'appels et leur ordre de résolution.
function makeControllableNotificationsBuilder() {
  const resolvers = [];
  const builder = {};
  ["select", "eq", "is", "order"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.limit = vi.fn(() => {
    let resolveFn;
    const promise = new Promise((res) => { resolveFn = res; });
    resolvers.push(resolveFn);
    return { then: (resolve, reject) => promise.then(resolve, reject) };
  });
  return { builder, resolvers };
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

function makeFollowerNotifs(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${offset + i}`,
    type: "new_follower",
    community_id: null,
    target_type: "profile",
    target_id: `p${offset + i}`,
    actor_id: `a${offset + i}`,
    read_at: null,
    created_at: new Date(2024, 0, 1, 0, 0, offset + i).toISOString(),
    actor: { name: `Personne ${offset + i}`, avatar_url: null },
  }));
}

describe("SocialShell — notifications : garde anti-double-clic sur \"Charger plus\"", () => {
  let notifBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    notifBuilder = makeControllableNotificationsBuilder();
    mocks.fromMock.mockImplementation((table) => {
      if (table === "notifications") return notifBuilder.builder;
      return makeQueryBuilder();
    });
  });

  it("un second clic pendant que le premier \"Charger plus\" est en vol ne déclenche pas de deuxième requête", async () => {
    const user = userEvent.setup();
    render(<SocialShell currentUser={{ id: "u1", name: "Test" }} setView={vi.fn()} handleSignOut={vi.fn()} />);

    // Chargement initial (limit=20) : résolu avec exactement 20 notifications
    // non lues -> notifHasMore doit passer à true (page pleine).
    await waitFor(() => expect(notifBuilder.resolvers.length).toBe(1));
    notifBuilder.resolvers[0]({ data: makeFollowerNotifs(20), error: null });

    const bell = await screen.findByRole("button", { name: "Notifications" });
    await user.click(bell);

    const loadMore = await screen.findByRole("button", { name: "Charger plus" });

    // Premier clic : déclenche la 2e requête (limit=40), reste en vol.
    await user.click(loadMore);
    await waitFor(() => expect(notifBuilder.resolvers.length).toBe(2));

    // Le bouton doit se désactiver pendant la requête (garde visuelle) —
    // sans ça, rien n'empêche un second clic de partir.
    const loadingButton = screen.getByRole("button", { name: "Chargement..." });
    expect(loadingButton).toBeDisabled();

    // Second clic (double-clic/tap rapide) pendant que la 1re page
    // supplémentaire est encore en vol : ne doit PAS déclencher de 3e appel.
    await user.click(loadingButton);
    expect(notifBuilder.resolvers.length).toBe(2); // toujours 2, pas 3

    // Résout la requête en vol : moins que la limite demandée -> plus de page
    // suivante, le bouton disparaît (et ne reste jamais bloqué sur
    // "Chargement...").
    notifBuilder.resolvers[1]({ data: makeFollowerNotifs(15, 20), error: null });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Chargement..." })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Charger plus" })).not.toBeInTheDocument();

    // Toujours exactement 2 requêtes au total (montage + une seule page
    // supplémentaire) malgré les deux clics.
    expect(notifBuilder.resolvers.length).toBe(2);
  });
});
