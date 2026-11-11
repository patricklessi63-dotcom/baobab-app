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

import { setPremiumNavigator, openPremium } from "./premiumIntent.js";

describe("openPremium / setPremiumNavigator", () => {
  it("sans navigateur enregistré : ne fait rien et le dit", () => {
    setPremiumNavigator(null);
    expect(openPremium("plans")).toBe(false);
    expect(consumePremiumIntent()).toBeNull();
  });
  it("avec un navigateur : pose l'intention puis navigue", () => {
    let seenIntent = "jamais appelé";
    setPremiumNavigator(() => { seenIntent = consumePremiumIntent(); });
    expect(openPremium("plans")).toBe(true);
    expect(seenIntent).toBe("plans");
    setPremiumNavigator(null);
  });
  it("'discover' (ou toute autre valeur) n'ajoute aucune intention", () => {
    setPremiumNavigator(() => {});
    openPremium("discover");
    expect(consumePremiumIntent()).toBeNull();
    setPremiumNavigator(null);
  });
});
