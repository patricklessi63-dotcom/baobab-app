import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit des compteurs de la cloche de notifications (SocialShell.jsx) :
// deux correctifs couverts ici.
//
// 1. "Tout marquer comme lu" ne ciblait en base que les notifications DÉJÀ
//    CHARGÉES localement (communityNotifications, borné à notifLimit — 20
//    par défaut avant tout clic sur "Charger plus"), via
//    `.update({read_at}).in("id", ids)`. Un compte avec plus de 20
//    notifications non lues en base (sans avoir cliqué "Charger plus") ne
//    voyait donc que les 20 plus récentes marquées lues côté serveur : les
//    plus anciennes restaient `read_at IS NULL` et réapparaissaient au
//    prochain fetchNotifications (rechargement de page, reconnexion réseau).
//    Ce test vérifie que la requête d'update ne se limite plus à `ids` mais
//    cible bien TOUTES les notifications non lues du destinataire
//    (`.eq("recipient_id", ...).is("read_at", null)`).
//
// 2. Le canal Realtime "notifications" n'écoutait que les INSERT : marquer
//    une notification lue depuis un autre onglet/appareil du même compte ne
//    faisait jamais redescendre le badge de CET onglet-ci avant un
//    rechargement complet. Ce test simule la réception d'un UPDATE
//    (read_at posé par un autre onglet) et vérifie que le badge local en
//    tient compte immédiatement.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), channelCalls: [] }));

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

// Builder dédié à "notifications" : distingue la chaîne SELECT (fetch initial,
// se termine par .limit()) de la chaîne UPDATE ("Tout marquer comme lu"), et
// enregistre les appels de la seconde pour inspection.
function makeNotificationsBuilder(initialUnread) {
  const updateCalls = [];
  function makeChain() {
    const calls = [];
    const chain = {};
    ["select", "update", "eq", "is", "order", "limit", "in"].forEach((m) => {
      chain[m] = vi.fn((...args) => { calls.push([m, args]); return chain; });
    });
    chain.then = (resolve, reject) => {
      const isUpdate = calls.some(([m]) => m === "update");
      if (isUpdate) {
        updateCalls.push(calls);
        return Promise.resolve({ error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: initialUnread, error: null }).then(resolve, reject);
    };
    return chain;
  }
  return { makeChain, updateCalls };
}

vi.mock("./../supabaseClient", () => ({
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
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";

function makeFollowerNotif(id, offset = 0) {
  return {
    id,
    type: "new_follower",
    community_id: null,
    target_type: "profile",
    target_id: `p${offset}`,
    actor_id: `a${offset}`,
    read_at: null,
    created_at: new Date(2024, 0, 1, 0, 0, offset).toISOString(),
    actor: { name: `Personne ${offset}`, avatar_url: null },
  };
}

describe("SocialShell — exactitude des compteurs de notifications", () => {
  let notifBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channelCalls.length = 0;
    // Simule un compte avec 3 notifications non lues chargées localement —
    // le point important du test n'est pas le nombre exact chargé, mais que
    // la requête d'update ne se restreigne plus à ces seuls ids.
    notifBuilder = makeNotificationsBuilder([
      makeFollowerNotif("n0", 0), makeFollowerNotif("n1", 1), makeFollowerNotif("n2", 2),
    ]);
    mocks.fromMock.mockImplementation((table) => {
      if (table === "notifications") return notifBuilder.makeChain();
      return makeQueryBuilder();
    });
  });

  it("« Tout marquer comme lu » met à jour TOUTES les notifications non lues du destinataire en base, pas seulement celles déjà chargées", async () => {
    const user = userEvent.setup();
    render(<SocialShell currentUser={{ id: "u1", name: "Test" }} setView={vi.fn()} handleSignOut={vi.fn()} />);

    const bell = await screen.findByRole("button", { name: "Notifications" });
    await user.click(bell);

    // Le même bouton "Tout marquer comme lu" est rendu deux fois à l'écran
    // (dropdown de la cloche dans le header + NotificationsPanel du fil
    // d'accueil, voir FeedTab.jsx) — les deux appellent la même fonction
    // partagée markCommunityNotificationsRead, donc cliquer sur l'un ou
    // l'autre déclenche exactement la même requête.
    const markAllReadButtons = await screen.findAllByRole("button", { name: "Tout marquer comme lu" });
    await user.click(markAllReadButtons[0]);

    await waitFor(() => expect(notifBuilder.updateCalls.length).toBe(1));
    const calls = notifBuilder.updateCalls[0];
    const calledMethods = calls.map(([m]) => m);

    // Le correctif retire le filtrage par ids chargés (.in("id", ids)) au
    // profit d'un filtrage global sur le destinataire + read_at manquant —
    // qui couvre aussi les lignes non lues jamais chargées localement.
    expect(calledMethods).not.toContain("in");
    expect(calls.find(([m]) => m === "eq")?.[1]).toEqual(["recipient_id", "u1"]);
    expect(calls.find(([m]) => m === "is")?.[1]).toEqual(["read_at", null]);
  });

  it("un UPDATE Realtime (notification marquée lue depuis un autre onglet) fait redescendre le badge sans recharger la page", async () => {
    const user = userEvent.setup();
    render(<SocialShell currentUser={{ id: "u1", name: "Test" }} setView={vi.fn()} handleSignOut={vi.fn()} />);

    const bell = await screen.findByRole("button", { name: "Notifications" });
    await user.click(bell);

    // Les 3 notifications non lues sont chargées -> le bouton "Tout marquer
    // comme lu" est visible (unreadCommunityCount > 0), affiché deux fois
    // (dropdown + NotificationsPanel du fil, voir commentaire ci-dessus).
    await screen.findAllByRole("button", { name: "Tout marquer comme lu" });

    const updateHandler = mocks.channelCalls.find(
      (c) => c.type === "postgres_changes" && c.config?.table === "notifications" && c.config?.event === "UPDATE"
    )?.handler;
    expect(updateHandler).toBeTruthy();

    // Simule : un autre onglet du même compte vient de marquer n0, n1 et n2
    // comme lues (Realtime redélivre un événement par ligne modifiée).
    updateHandler({ new: { id: "n0", read_at: "2026-01-01T00:00:00Z" }, old: { read_at: null } });
    updateHandler({ new: { id: "n1", read_at: "2026-01-01T00:00:00Z" }, old: { read_at: null } });
    updateHandler({ new: { id: "n2", read_at: "2026-01-01T00:00:00Z" }, old: { read_at: null } });

    // Avant le correctif, seul l'INSERT était écouté : ce bouton (piloté par
    // unreadCommunityCount > 0) serait resté affiché indéfiniment côté onglet
    // spectateur malgré les 3 notifications désormais lues en base.
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Tout marquer comme lu" })).toHaveLength(0));
  });
});
