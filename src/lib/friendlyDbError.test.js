import { describe, it, expect } from "vitest";
import { friendlyDbError } from "./friendlyDbError.js";

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
