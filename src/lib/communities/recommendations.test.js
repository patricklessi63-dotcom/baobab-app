import { describe, it, expect } from "vitest";
import { scoreCommunity, rankCommunities } from "./recommendations.js";

const community = (over = {}) => ({
  name: "Club",
  category: "sport",
  description: "",
  city: "Montréal",
  ...over,
});

describe("scoreCommunity", () => {
  it("score 0 et aucune raison pour un utilisateur vide", () => {
    expect(scoreCommunity(null, community())).toEqual({ score: 0, reasons: [] });
    expect(scoreCommunity({}, community({ city: null }))).toEqual({ score: 0, reasons: [] });
  });

  it("+3 pour une ville identique (insensible à la casse et aux espaces)", () => {
    const res = scoreCommunity({ city: "  montréal " }, community({ city: "Montréal" }));
    expect(res.score).toBe(3);
    expect(res.reasons[0]).toContain("Montréal");
  });

  it("+3 pour une ville identique insensible aux accents (ville = champ texte libre, non normalisé à la saisie)", () => {
    // Même bug/correctif que matchingService.js : "Montreal" (sans accent)
    // et "Montréal" sont la même ville réelle.
    const res = scoreCommunity({ city: "Montreal" }, community({ city: "Montréal" }));
    expect(res.score).toBe(3);
    expect(res.reasons[0]).toContain("Montréal");
  });

  it("+2 par intérêt trouvé dans catégorie/nom/description", () => {
    const res = scoreCommunity(
      { interests: "sport, cuisine" },
      community({ category: "sport", name: "Les gourmets", description: "on parle cuisine" })
    );
    // "sport" via categoryLabel("sport")="Sport", "cuisine" via description -> 2 * 2
    expect(res.score).toBe(4);
    expect(res.reasons[0]).toContain("Lié à");
  });

  it("+2 pour un intérêt avec emoji (valeur réelle de ChipSelect) trouvé dans la description", () => {
    // INTERESTS_OPTIONS stocke "🍳 Cuisine" tel quel : sans retrait de l'emoji,
    // la sous-chaîne "🍳 cuisine" n'apparaissait jamais dans un texte libre.
    const res = scoreCommunity(
      { interests: "🍳 Cuisine" },
      community({ category: "art", name: "Les gourmets", description: "on parle cuisine" })
    );
    expect(res.score).toBe(2);
    expect(res.reasons[0]).toBe("Lié à 🍳 Cuisine");
  });

  it("intérêt avec emoji et accent (🎬 Cinéma) trouvé sans accent dans la description", () => {
    const res = scoreCommunity(
      { interests: "🎬 Cinéma, 🏃 Sport" },
      community({ category: "art", name: "Ciné-club", description: "soirées cinema du jeudi" })
    );
    expect(res.score).toBe(2);
    expect(res.reasons[0]).toBe("Lié à 🎬 Cinéma");
  });

  it("un intérêt réduit à un emoji ne matche jamais", () => {
    expect(scoreCommunity({ interests: "🍳" }, community({ description: "cuisine" })).score).toBe(0);
  });

  it("cumule ville + intérêts", () => {
    const res = scoreCommunity(
      { city: "Laval", interests: "musique" },
      community({ city: "Laval", category: "musique" })
    );
    expect(res.score).toBe(3 + 2);
    expect(res.reasons).toHaveLength(2);
  });

  it("aucun intérêt correspondant -> pas de bonus", () => {
    const res = scoreCommunity({ interests: "escalade" }, community({ category: "sport" }));
    expect(res.score).toBe(0);
  });
});

describe("rankCommunities", () => {
  it("trie par score décroissant et attache la communauté", () => {
    const user = { city: "Montréal", interests: "sport" };
    const list = [
      community({ name: "A", city: "Québec", category: "art" }),
      community({ name: "B", city: "Montréal", category: "sport" }),
      community({ name: "C", city: "Montréal", category: "art" }),
    ];
    const ranked = rankCommunities(user, list);
    expect(ranked.map((r) => r.community.name)).toEqual(["B", "C", "A"]);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it("liste vide -> tableau vide", () => {
    expect(rankCommunities({}, [])).toEqual([]);
  });
});
