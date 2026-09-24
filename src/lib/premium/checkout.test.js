import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("../../supabaseClient", () => ({
  supabase: { functions: { invoke: mocks.invokeMock } },
}));

import { startCheckout, openBillingPortal } from "./checkout";

// Bug corrigé (24 sept., signalé en prod) : sur une erreur HTTP de l'edge
// function (statut non-2xx), le SDK supabase-js met le corps JSON dans
// `error.context` (le vrai Response, voir sa doc — "await error.context.json()"),
// jamais dans `data` (qui reste null). Avant ce correctif, ces deux fonctions
// jetaient un message générique "Réessaie" sans jamais lire ce corps, masquant
// la vraie raison ("Aucun abonnement trouvé pour ce compte.", etc.) — le seul
// indice visible en prod était un "400" muet dans la console réseau.
function makeHttpError(bodyJson) {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.context = { json: () => Promise.resolve(bodyJson) };
  return error;
}

describe("openBillingPortal — surface le vrai message d'erreur de l'edge function", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propage le message précis renvoyé par create-portal-session (ex. abonnement introuvable)", async () => {
    mocks.invokeMock.mockResolvedValue({ data: null, error: makeHttpError({ error: "Aucun abonnement trouvé pour ce compte." }) });
    await expect(openBillingPortal()).rejects.toThrow("Aucun abonnement trouvé pour ce compte.");
  });

  it("retombe sur le message générique si le corps n'est pas exploitable (erreur réseau/relais)", async () => {
    const error = new Error("network error"); // pas de `.context` (FunctionsFetchError/RelayError)
    mocks.invokeMock.mockResolvedValue({ data: null, error });
    await expect(openBillingPortal()).rejects.toThrow("Impossible d'ouvrir la gestion de l'abonnement. Réessaie.");
  });

  it("retombe sur le générique si error.context.json() rejette (corps non-JSON)", async () => {
    const error = new Error("http error");
    error.context = { json: () => Promise.reject(new Error("not json")) };
    mocks.invokeMock.mockResolvedValue({ data: null, error });
    await expect(openBillingPortal()).rejects.toThrow("Impossible d'ouvrir la gestion de l'abonnement. Réessaie.");
  });
});

describe("startCheckout — même correctif appliqué symétriquement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propage le message précis renvoyé par create-checkout-session", async () => {
    mocks.invokeMock.mockResolvedValue({ data: null, error: makeHttpError({ error: "Tu es déjà abonné·e à Baobab Premium." }) });
    await expect(startCheckout("monthly")).rejects.toThrow("Tu es déjà abonné·e à Baobab Premium.");
  });
});
