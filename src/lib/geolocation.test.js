import { describe, it, expect } from "vitest";
import { roundCoordinate, LOCATION_ERROR_MESSAGES } from "./geolocation.js";

describe("roundCoordinate", () => {
  it("arrondit à 2 décimales (~1,1 km)", () => {
    expect(roundCoordinate(45.50123)).toBe(45.5);
    expect(roundCoordinate(-73.56789)).toBe(-73.57);
    expect(roundCoordinate(43.6532)).toBe(43.65);
  });

  it("arrondi au plus proche", () => {
    expect(roundCoordinate(1.006)).toBe(1.01);
    expect(roundCoordinate(1.004)).toBe(1.0);
    // Quirk flottant IEEE-754 assumé : 1.005*100 = 100.4999… -> arrondi à 1.0
    // (Math.round standard, pas un bug du module).
    expect(roundCoordinate(1.005)).toBe(1.0);
  });

  it("0 et entiers inchangés", () => {
    expect(roundCoordinate(0)).toBe(0);
    expect(roundCoordinate(-40)).toBe(-40);
  });

  it("réduit effectivement la précision d'un GPS exact", () => {
    const exact = 45.5017123456;
    expect(String(roundCoordinate(exact)).length).toBeLessThan(String(exact).length);
  });
});

describe("LOCATION_ERROR_MESSAGES", () => {
  it("messages FR pour tous les codes attendus", () => {
    for (const code of [
      "PERMISSION_DENIED",
      "POSITION_UNAVAILABLE",
      "TIMEOUT",
      "UNSUPPORTED",
      "UNKNOWN",
    ]) {
      expect(typeof LOCATION_ERROR_MESSAGES[code]).toBe("string");
      expect(LOCATION_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  it("aucun message ne fuit de jargon technique brut", () => {
    for (const msg of Object.values(LOCATION_ERROR_MESSAGES)) {
      expect(msg).not.toMatch(/GeolocationPositionError|code \d/);
    }
  });
});
