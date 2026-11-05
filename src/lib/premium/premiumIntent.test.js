import { describe, it, expect } from "vitest";
import { setPremiumIntent, consumePremiumIntent } from "./premiumIntent.js";

describe("premiumIntent", () => {
  it("se lit une seule fois", () => {
    setPremiumIntent("plans");
    expect(consumePremiumIntent()).toBe("plans");
    expect(consumePremiumIntent()).toBeNull();
  });

  it("ignore toute valeur inconnue", () => {
    setPremiumIntent("autre");
    expect(consumePremiumIntent()).toBeNull();
    setPremiumIntent(undefined);
    expect(consumePremiumIntent()).toBeNull();
  });

  it("une nouvelle valeur remplace la précédente", () => {
    setPremiumIntent("plans");
    setPremiumIntent(null);
    expect(consumePremiumIntent()).toBeNull();
  });
});
