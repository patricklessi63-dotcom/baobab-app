import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("../../supabaseClient", () => ({
  supabase: { functions: { invoke: mocks.invokeMock } },
}));

// Même bug que celui déjà corrigé pour create-checkout-session/create-portal-
// session (src/lib/premium/checkout.test.js) : supabase-js ne met JAMAIS le
// corps JSON d'une réponse non-2xx dans `data` (qui reste null) — il faut le
// relire depuis `error.context` (le vrai Response porté par la
// FunctionsHttpError). aiClient.js a déjà le correctif (readServerErrorMessage,
// commit 531f12c) mais, contrairement à checkout.js, n'avait aucun test — ce
// fichier verrouille ce comportement contre toute régression future, en
// particulier pour le cas le plus sensible côté coût : la limite horaire de
// suggestions IA (ai-assist/index.ts, AI_RATE_LIMIT_PER_HOUR) doit remonter
// comme un message distinct, pas comme la panne générique "Le service IA n'a
// pas pu répondre".
function makeHttpError(bodyJson) {
  const error = new Error("Edge Function returned a non-2xx status code");
  error.context = { json: () => Promise.resolve(bodyJson) };
  return error;
}

describe("invokeAI — surface le vrai message d'erreur de l'edge function ai-assist", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("propage distinctement le message de limite horaire atteinte (429 côté serveur)", async () => {
    mocks.invokeMock.mockResolvedValue({
      data: null,
      error: makeHttpError({ error: "Limite de suggestions IA atteinte pour cette heure. Réessaie plus tard." }),
    });
    const { invokeAI } = await import("./aiClient");
    const { data, error } = await invokeAI("improve_bio", { text: "bonjour" });
    expect(data).toBeNull();
    expect(error).toBe("Limite de suggestions IA atteinte pour cette heure. Réessaie plus tard.");
  });

  it("propage les autres messages précis du serveur (ex. suggestions IA désactivées, non authentifié)", async () => {
    mocks.invokeMock.mockResolvedValue({
      data: null,
      error: makeHttpError({ error: "Les suggestions IA sont désactivées pour ce compte (Confidentialité → Suggestions IA)." }),
    });
    const { invokeAI } = await import("./aiClient");
    const { error } = await invokeAI("improve_post", { text: "bonjour" });
    expect(error).toBe("Les suggestions IA sont désactivées pour ce compte (Confidentialité → Suggestions IA).");
  });

  it("retombe sur le message générique si le corps n'est pas exploitable (erreur réseau/relais, pas de .context)", async () => {
    mocks.invokeMock.mockResolvedValue({ data: null, error: new Error("network error") });
    const { invokeAI } = await import("./aiClient");
    const { data, error } = await invokeAI("improve_bio", { text: "bonjour" });
    expect(data).toBeNull();
    expect(error).toBe("Le service IA n'a pas pu répondre. Réessaie.");
  });

  it("retombe sur le générique si error.context.json() rejette (corps non-JSON ou déjà consommé)", async () => {
    const error = new Error("http error");
    error.context = { json: () => Promise.reject(new Error("not json")) };
    mocks.invokeMock.mockResolvedValue({ data: null, error });
    const { invokeAI } = await import("./aiClient");
    const { error: resultError } = await invokeAI("improve_bio", { text: "bonjour" });
    expect(resultError).toBe("Le service IA n'a pas pu répondre. Réessaie.");
  });

  it("retourne data en cas de succès (statut 2xx)", async () => {
    mocks.invokeMock.mockResolvedValue({ data: { text: "Texte amélioré." }, error: null });
    const { invokeAI } = await import("./aiClient");
    const { data, error } = await invokeAI("improve_bio", { text: "bonjour" });
    expect(error).toBeNull();
    expect(data).toEqual({ text: "Texte amélioré." });
  });

  it("propage data.error quand la réponse est 2xx mais porte un champ error applicatif (ex. JSON IA invalide)", async () => {
    mocks.invokeMock.mockResolvedValue({ data: { error: "Réponse IA invalide, réessaie." }, error: null });
    const { invokeAI } = await import("./aiClient");
    const { data, error } = await invokeAI("suggest_community", { text: "foo" });
    expect(data).toBeNull();
    expect(error).toBe("Réponse IA invalide, réessaie.");
  });
});

describe("invokeAI — anti-rebond client (5 appels / 10s)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("bloque le 6e appel rapproché sans jamais appeler l'edge function, avec un message distinct de la limite serveur", async () => {
    mocks.invokeMock.mockResolvedValue({ data: { text: "ok" }, error: null });
    const { invokeAI } = await import("./aiClient");
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { error } = await invokeAI("improve_bio", { text: `essai ${i}` });
      expect(error).toBeNull();
    }
    expect(mocks.invokeMock).toHaveBeenCalledTimes(5);

    const { data, error } = await invokeAI("improve_bio", { text: "essai 6" });
    expect(data).toBeNull();
    expect(error).toBe("Trop de demandes IA en peu de temps. Attends quelques secondes et réessaie.");
    // Le 6e appel est bloqué côté client avant même d'atteindre le réseau —
    // le compteur n'augmente pas.
    expect(mocks.invokeMock).toHaveBeenCalledTimes(5);
  });
});
