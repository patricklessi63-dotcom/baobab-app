import { describe, it, expect } from "vitest";
import { PREMIUM_PLANS, PREMIUM_FEATURES, planById } from "./premiumConfig.js";

describe("premiumConfig", () => {
  it("expose exactement les plans mensuel et annuel", () => {
    expect(PREMIUM_PLANS.map((p) => p.id)).toEqual(["monthly", "yearly"]);
  });

  it("chaque plan a un libellé de prix, une période et une devise CAD", () => {
    for (const p of PREMIUM_PLANS) {
      expect(typeof p.priceLabel).toBe("string");
      expect(typeof p.period).toBe("string");
      expect(p.currency).toBe("CAD");
    }
  });

  it("le plan annuel porte un badge d'économie et un sous-libellé", () => {
    const yearly = PREMIUM_PLANS.find((p) => p.id === "yearly");
    expect(yearly.badge).toBeTruthy();
    expect(yearly.subLabel).toBeTruthy();
  });

  it("PREMIUM_FEATURES : entrées avec icône, libellé et description", () => {
    expect(PREMIUM_FEATURES.length).toBeGreaterThan(0);
    for (const f of PREMIUM_FEATURES) {
      expect(f.icon).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.description).toBeTruthy();
    }
  });

  it("planById renvoie le plan correspondant", () => {
    expect(planById("monthly")).toBe(PREMIUM_PLANS[0]);
    expect(planById("yearly")).toBe(PREMIUM_PLANS[1]);
  });

  it("planById renvoie null pour un id inconnu ou absent", () => {
    expect(planById("weekly")).toBeNull();
    expect(planById(undefined)).toBeNull();
    expect(planById(null)).toBeNull();
  });
});
