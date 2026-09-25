import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Bug corrigé à l'audit du cycle de vie Premium : le hook ne revérifiait
// "subscriptions" qu'au montage ou sur refresh() explicite (retour de
// Stripe Checkout dans PremiumPage). Un composant resté monté toute la
// session (ex. l'onglet "Abonnement" de ProfileTab, ouvert puis laissé en
// arrière-plan) ne relançait donc jamais cette requête tout seul : si
// l'abonnement expirait ou passait à "canceled" côté Stripe pendant que
// l'onglet était en arrière-plan, `isPremium` restait vrai (valeur chargée
// avant l'expiration) jusqu'à un rechargement complet de la page, malgré
// un webhook déjà traité entre-temps. Ce test fixe le contrat : au retour
// de focus sur l'onglet ("visibilitychange" -> "visible"), le hook
// revérifie le statut, comme le fait déjà App.jsx pour la présence/le
// bannissement.

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

const queryMock = vi.fn();
vi.mock("../../supabaseClient", () => ({
  supabase: { from: (...args) => queryMock(...args) },
}));

import { usePremiumStatus } from "./usePremiumStatus";

function makeQuery(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const user = { id: "u1" };
const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");

describe("usePremiumStatus — revérifie au retour de focus sur l'onglet", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility);
  });

  it("abonnement expiré pendant que l'onglet était en arrière-plan : isPremium repasse à false dès le retour de focus, sans rechargement", async () => {
    queryMock.mockReturnValueOnce(makeQuery({
      data: { status: "active", plan: "monthly", current_period_end: "2999-01-01T00:00:00.000Z" },
      error: null,
    }));
    const { result } = renderHook(() => usePremiumStatus(user));
    await waitFor(() => expect(result.current.isPremium).toBe(true));

    // Le webhook Stripe a entre-temps marqué l'abonnement "canceled" en base.
    queryMock.mockReturnValueOnce(makeQuery({
      data: { status: "canceled", plan: "monthly", current_period_end: "2999-01-01T00:00:00.000Z" },
      error: null,
    }));
    act(() => setVisibility("visible"));

    await waitFor(() => expect(result.current.isPremium).toBe(false));
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("passage en arrière-plan (hidden) : ne déclenche aucune revérification superflue", async () => {
    queryMock.mockReturnValueOnce(makeQuery({
      data: { status: "active", plan: "monthly", current_period_end: "2999-01-01T00:00:00.000Z" },
      error: null,
    }));
    const { result } = renderHook(() => usePremiumStatus(user));
    await waitFor(() => expect(result.current.isPremium).toBe(true));

    act(() => setVisibility("hidden"));
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
