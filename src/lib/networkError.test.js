import { describe, it, expect, afterEach, vi } from "vitest";
import { isAmbiguousWriteError, isNetworkFailure, networkFailureMessage } from "./networkError";

// postgrest-js ne lève pas en cas de coupure : il renvoie une erreur SANS code.
// Les erreurs serveur (contrainte, RLS, trigger) ont toujours un code.

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("isAmbiguousWriteError", () => {
  it("erreur sans code (coupure, réponse perdue, passerelle) : issue incertaine", () => {
    expect(isAmbiguousWriteError({ message: "TypeError: Failed to fetch", code: "" })).toBe(true);
    expect(isAmbiguousWriteError({ message: "Bad Gateway" })).toBe(true);
    expect(isAmbiguousWriteError(new TypeError("Load failed"))).toBe(true);
  });
  it("erreur serveur avec code : refus définitif, rien n'a été écrit", () => {
    expect(isAmbiguousWriteError({ message: "permission denied", code: "42501" })).toBe(false);
    expect(isAmbiguousWriteError({ message: "duplicate key", code: "23505" })).toBe(false);
    expect(isAmbiguousWriteError({ message: "FREE_MESSAGE_LIMIT_REACHED: x", code: "P0001" })).toBe(false);
  });
  it("pas d'erreur : pas ambigu", () => {
    expect(isAmbiguousWriteError(null)).toBe(false);
  });
});

describe("isNetworkFailure / networkFailureMessage", () => {
  it("reconnaît les messages de coupure des trois moteurs (Chrome, Firefox, Safari)", () => {
    expect(isNetworkFailure({ message: "TypeError: Failed to fetch", code: "" })).toBe(true);
    expect(isNetworkFailure({ message: "NetworkError when attempting to fetch resource.", code: "" })).toBe(true);
    expect(isNetworkFailure({ message: "TypeError: Load failed", code: "" })).toBe(true);
    expect(isNetworkFailure({ message: "AbortError: signal is aborted without reason" })).toBe(true);
  });
  it("une erreur serveur avec code n'est jamais prise pour une coupure", () => {
    expect(isNetworkFailure({ message: "Failed to fetch", code: "42501" })).toBe(false);
  });
  it("hors ligne, toute erreur sans code est une coupure", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkFailure({ message: "quelque chose" })).toBe(true);
    expect(networkFailureMessage()).toBe("Pas de connexion internet.");
  });
  it("en ligne mais requête échouée : message « connexion instable »", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(networkFailureMessage()).toMatch(/instable/);
  });
});
