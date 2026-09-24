import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Bug corrigé : une requête "subscriptions" en échec (coupure réseau, panne
// Supabase ponctuelle) était traitée EXACTEMENT comme "chargement terminé,
// aucun abonnement" — `loading` passait à false sans jamais exposer l'erreur
// aux appelants (PremiumPage, badge de profil...). Un·e abonné·e Premium
// dont la vérification échouait juste au mauvais moment se voyait donc
// annoncer, à tort, qu'il/elle n'a pas Premium (isPremium === false),
// indiscernable d'un vrai statut gratuit confirmé. Ce test fixe le contrat :
// le hook expose désormais `error`, et une erreur de rafraîchissement ne doit
// pas effacer un abonnement déjà connu.

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

describe("usePremiumStatus — surface les erreurs réseau au lieu de les avaler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("échec de la requête initiale : expose `error`, ne prétend pas silencieusement 'pas premium' sans info", async () => {
    queryMock.mockReturnValueOnce(makeQuery({ data: null, error: { message: "Failed to fetch", code: "NETWORK" } }));
    const { result } = renderHook(() => usePremiumStatus(user));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to fetch");
    expect(result.current.subscription).toBeNull();
    expect(result.current.isPremium).toBe(false);
  });

  it("échec d'un refresh() après un chargement initial réussi : garde l'abonnement déjà connu plutôt que de l'effacer", async () => {
    queryMock.mockReturnValueOnce(makeQuery({ data: { status: "active", plan: "yearly" }, error: null }));
    const { result } = renderHook(() => usePremiumStatus(user));

    await waitFor(() => expect(result.current.isPremium).toBe(true));
    expect(result.current.error).toBeNull();

    queryMock.mockReturnValueOnce(makeQuery({ data: null, error: { message: "Failed to fetch" } }));
    act(() => { result.current.refresh(); });

    await waitFor(() => expect(result.current.error).toBe("Failed to fetch"));
    // L'abonnement déjà connu (chargé avec succès juste avant) n'est pas
    // effacé par l'échec du refresh : rester Premium le temps que la
    // prochaine vérification réussisse, plutôt que de perdre l'accès sur une
    // simple erreur réseau passagère.
    expect(result.current.subscription).toEqual({ status: "active", plan: "yearly" });
    expect(result.current.isPremium).toBe(true);
  });
});
