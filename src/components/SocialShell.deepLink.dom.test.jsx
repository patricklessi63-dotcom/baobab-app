import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Lien profond (app native : clic sur une notification, App Link) consommé par
// le VRAI SocialShell : il réutilise les mécanismes des clics de notification
// existants. Les requêtes passent par la RLS ; une entité inaccessible ou
// supprimée (le serveur ne renvoie rien) donne un message, jamais un plantage.

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), eqCalls: [] }));

function makeQueryBuilder(table) {
  const builder = {};
  ["select", "neq", "gt", "gte", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.eq = vi.fn((col, val) => { mocks.eqCalls.push([table, col, val]); return builder; });
  // Entité introuvable / masquée par la RLS : aucune ligne, aucune erreur.
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: { code: "PGRST116", message: "0 rows" } }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
  return builder;
}

vi.mock("./../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";

const ME = { id: "profile-me", name: "Moi" };

function mount(deepLink, extra = {}) {
  const onError = vi.fn();
  const onDeepLinkHandled = vi.fn();
  render(<SocialShell currentUser={ME} setView={vi.fn()} handleSignOut={vi.fn()} onError={onError} deepLink={deepLink} onDeepLinkHandled={onDeepLinkHandled} {...extra} />);
  return { onError, onDeepLinkHandled };
}
const hasEq = (table, val) => mocks.eqCalls.some(([t, c, v]) => t === table && c === "id" && v === val);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eqCalls.length = 0;
  mocks.fromMock.mockImplementation((table) => makeQueryBuilder(table));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("SocialShell — lien profond", () => {
  it("profil inaccessible ou supprimé : message « n'est plus disponible », aucun plantage", async () => {
    const { onError, onDeepLinkHandled } = mount({ kind: "profile", id: UUID, at: Date.now(), seq: 1 });
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Ce profil n'est plus disponible."));
    expect(hasEq("profiles", UUID)).toBe(true);
    expect(onDeepLinkHandled).toHaveBeenCalledTimes(1);
  });

  it("conversation avec une personne inaccessible : même message, aucune conversation ouverte", async () => {
    const { onError } = mount({ kind: "messages", id: UUID, at: Date.now(), seq: 1 });
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Ce profil n'est plus disponible."));
    expect(hasEq("profiles", UUID)).toBe(true);
  });

  it("événement inaccessible ou supprimé : bascule sur l'onglet Événements et affiche l'erreur habituelle", async () => {
    const { onError } = mount({ kind: "event", id: UUID, at: Date.now(), seq: 1 });
    await waitFor(() => expect(hasEq("events", UUID)).toBe(true), { timeout: 10000 });
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de charger cet événement."), { timeout: 10000 });
  }, 20000);

  it("communauté : ouvre l'onglet Communautés et interroge cette communauté (sous RLS)", async () => {
    mount({ kind: "community", id: UUID, at: Date.now(), seq: 1 });
    await waitFor(() => expect(hasEq("communities", UUID)).toBe(true), { timeout: 10000 });
  }, 20000);

  it("destination périmée (> 10 min) : consommée mais rien n'est ouvert", async () => {
    const { onDeepLinkHandled, onError } = mount({ kind: "profile", id: UUID, at: Date.now() - 11 * 60 * 1000, seq: 1 });
    await waitFor(() => expect(onDeepLinkHandled).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(hasEq("profiles", UUID)).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it("lien vers son propre profil : onglet Profil, aucune requête sur un profil tiers", async () => {
    const { onDeepLinkHandled } = mount({ kind: "profile", id: ME.id, at: Date.now(), seq: 1 });
    await waitFor(() => expect(onDeepLinkHandled).toHaveBeenCalled());
    expect(hasEq("profiles", ME.id)).toBe(false);
  });

  it("sans lien (cas du web et de l'usage normal) : rien n'est consommé ni ouvert", async () => {
    const { onDeepLinkHandled, onError } = mount(null);
    await new Promise((r) => setTimeout(r, 30));
    expect(onDeepLinkHandled).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(hasEq("events", UUID)).toBe(false);
  });
});
