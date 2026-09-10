import { describe, it, expect } from "vitest";
import { isLikelyInCanada, TRAVEL_GRACE_PERIOD_MS } from "./canadaGate.js";

describe("isLikelyInCanada", () => {
  it("retourne null si lat ou lon n'est pas un nombre", () => {
    expect(isLikelyInCanada("43", "-79")).toBeNull();
    expect(isLikelyInCanada(undefined, undefined)).toBeNull();
    expect(isLikelyInCanada(43.65, null)).toBeNull();
  });

  it("reconnaît des villes canadiennes (sud, ouest, grand nord)", () => {
    expect(isLikelyInCanada(43.65, -79.38)).toBe(true); // Toronto
    expect(isLikelyInCanada(45.5, -73.57)).toBe(true); // Montréal
    expect(isLikelyInCanada(49.28, -123.12)).toBe(true); // Vancouver
    expect(isLikelyInCanada(63.75, -68.52)).toBe(true); // Iqaluit
  });

  it("rejette des positions hors boîte englobante", () => {
    expect(isLikelyInCanada(40.71, -74.0)).toBe(false); // New York (trop au sud)
    expect(isLikelyInCanada(51.5, -0.12)).toBe(false); // Londres (longitude hors plage)
    expect(isLikelyInCanada(19.43, -99.13)).toBe(false); // Mexico
  });

  it("inclut les bornes (comparaisons >= / <=)", () => {
    expect(isLikelyInCanada(41.6, -100)).toBe(true);
    expect(isLikelyInCanada(83.5, -100)).toBe(true);
    expect(isLikelyInCanada(60, -141.1)).toBe(true);
    expect(isLikelyInCanada(60, -52.3)).toBe(true);
  });

  it("la période de grâce voyage vaut 60 jours", () => {
    expect(TRAVEL_GRACE_PERIOD_MS).toBe(60 * 24 * 60 * 60 * 1000);
  });
});
