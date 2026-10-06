import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Audit performance (6 oct. 2026) : changer un réglage (confidentialité,
// préférences de notifications, avatar...) fait remplacer l'objet currentUser
// par App.jsx, avec le MÊME id. Les effets de chargement/abonnement de
// SocialShell dépendaient de l'objet entier : chaque bascule relançait ~10
// requêtes (listes d'abonnements de 2000 lignes, 500 derniers messages...) et
// désabonnait/réabonnait 3 canaux Realtime. Ce test monte le VRAI SocialShell,
// remplace currentUser par un nouvel objet de même id, et vérifie qu'aucune
// requête ni aucun canal n'est relancé.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), channelMock: vi.fn(), removeChannelMock: vi.fn() }));

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock("./../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: mocks.channelMock,
    removeChannel: mocks.removeChannelMock,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";

describe("SocialShell — un nouvel objet currentUser de même id ne relance ni requêtes ni canaux Realtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromMock.mockImplementation(() => makeQueryBuilder());
    mocks.channelMock.mockImplementation(() => {
      const ch = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    });
  });

  it("changer un réglage de currentUser (même id) ne recharge pas favoris/abonnements/notifications et ne recrée aucun canal", async () => {
    const props = { setView: vi.fn(), handleSignOut: vi.fn() };
    const { rerender } = render(<SocialShell {...props} currentUser={{ id: "u1", name: "Test", show_online_status: true }} />);

    await waitFor(() => expect(mocks.channelMock.mock.calls.length).toBeGreaterThan(0));
    const tables = (calls) => calls.map((c) => c[0]);
    const channelsBefore = mocks.channelMock.mock.calls.length;
    const fromBefore = mocks.fromMock.mock.calls.length;
    const followsBefore = tables(mocks.fromMock.mock.calls).filter((t) => t === "follows").length;
    expect(followsBefore).toBe(2); // sanity : les 2 listes d'abonnements ont bien été chargées au montage

    // Même compte, réglage modifié : nouvelle référence d'objet.
    rerender(<SocialShell {...props} currentUser={{ id: "u1", name: "Test", show_online_status: false }} />);
    rerender(<SocialShell {...props} currentUser={{ id: "u1", name: "Test", show_online_status: false, notification_preferences: { likes: false } }} />);
    await new Promise((r) => setTimeout(r, 30));

    expect(mocks.channelMock.mock.calls.length).toBe(channelsBefore);
    expect(mocks.removeChannelMock).not.toHaveBeenCalled();
    expect(mocks.fromMock.mock.calls.length).toBe(fromBefore);
  });

  it("un VRAI changement de compte (autre id) recharge bien les données et recrée les canaux", async () => {
    const props = { setView: vi.fn(), handleSignOut: vi.fn() };
    const { rerender } = render(<SocialShell {...props} currentUser={{ id: "u1", name: "Test" }} />);
    await waitFor(() => expect(mocks.channelMock.mock.calls.length).toBeGreaterThan(0));
    const channelsBefore = mocks.channelMock.mock.calls.length;

    rerender(<SocialShell {...props} currentUser={{ id: "u2", name: "Autre" }} />);
    await waitFor(() => expect(mocks.channelMock.mock.calls.length).toBeGreaterThan(channelsBefore));
    expect(mocks.removeChannelMock).toHaveBeenCalled();
  });
});
