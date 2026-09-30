import { describe, it, expect } from "vitest";
import { friendlyDbError, dbErrorCode } from "./friendlyDbError.js";

describe("friendlyDbError", () => {
  it("retourne null si le code n'est pas P0001 (exception métier Postgres)", () => {
    expect(friendlyDbError(null)).toBeNull();
    expect(friendlyDbError(undefined)).toBeNull();
    expect(friendlyDbError({ code: "23505", message: "duplicate key" })).toBeNull();
    expect(friendlyDbError({ message: "sans code" })).toBeNull();
  });

  it("extrait le message FR en retirant le préfixe technique CODE_EN_MAJ:", () => {
    expect(
      friendlyDbError({ code: "P0001", message: "FREE_MESSAGE_LIMIT_REACHED: Tu as atteint ta limite de messages gratuits." }),
    ).toBe("Tu as atteint ta limite de messages gratuits.");
  });

  it("laisse le message intact s'il n'a pas de préfixe technique", () => {
    expect(friendlyDbError({ code: "P0001", message: "Action réservée aux membres Premium." })).toBe(
      "Action réservée aux membres Premium.",
    );
  });

  it("retourne null plutôt qu'une chaîne vide si le message est absent ou réduit au préfixe", () => {
    expect(friendlyDbError({ code: "P0001" })).toBeNull();
    expect(friendlyDbError({ code: "P0001", message: "" })).toBeNull();
    expect(friendlyDbError({ code: "P0001", message: "RATE_LIMIT: " })).toBeNull();
  });
});

describe("dbErrorCode", () => {
  it("retourne null si le code n'est pas P0001", () => {
    expect(dbErrorCode(null)).toBeNull();
    expect(dbErrorCode({ code: "23505", message: "FREE_MESSAGE_LIMIT_REACHED: x" })).toBeNull();
  });

  it("extrait le préfixe technique en majuscules d'une exception P0001", () => {
    expect(
      dbErrorCode({ code: "P0001", message: "FREE_MESSAGE_LIMIT_REACHED: limite de 20 messages gratuits atteinte." }),
    ).toBe("FREE_MESSAGE_LIMIT_REACHED");
    expect(
      dbErrorCode({ code: "P0001", message: "PREMIUM_MEDIA_REQUIRED: l'envoi de photos et vidéos nécessite Baobab Premium." }),
    ).toBe("PREMIUM_MEDIA_REQUIRED");
  });

  it("retourne null si le message n'a pas de préfixe technique", () => {
    expect(dbErrorCode({ code: "P0001", message: "Action réservée aux membres Premium." })).toBeNull();
  });
});
