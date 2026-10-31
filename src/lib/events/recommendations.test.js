import { describe, it, expect } from "vitest";
import { scoreEvent, rankEvents } from "./recommendations.js";

const event = (over = {}) => ({
  title: "Match amical",
  category: "sport",
  description: "",
  city: "Toronto",
  community_id: null,
  ...over,
});

describe("scoreEvent", () => {
  it("utilisateur vide -> score 0", () => {
    expect(scoreEvent(null, event())).toEqual({ score: 0, reasons: [] });
  });

  it("+3 ville commune (normalisée)", () => {
    const res = scoreEvent({ city: "toronto  " }, event({ city: "Toronto" }));
    expect(res.score).toBe(3);
  });

  it("+3 ville commune insensible aux accents (ville = champ texte libre, non normalisé à la saisie)", () => {
    // Même bug/correctif que matchingService.js : "Montreal" (sans accent)
    // et "Montréal" sont la même ville réelle.
    const res = scoreEvent({ city: "Montreal" }, event({ city: "Montréal" }));
    expect(res.score).toBe(3);
  });

  it("+2 par intérêt trouvé dans catégorie/titre/description", () => {
    const res = scoreEvent(
      { interests: "sport" },
      event({ category: "sport", title: "Tournoi" })
    );
    expect(res.score).toBe(2);
    expect(res.reasons[0]).toContain("Lié à");
  });

  it("+2 pour un intérêt avec emoji (valeur réelle de ChipSelect) trouvé dans la description", () => {
    // INTERESTS_OPTIONS stocke "🍳 Cuisine" tel quel : sans retrait de l'emoji,
    // la sous-chaîne "🍳 cuisine" n'apparaissait jamais dans un texte libre.
    const res = scoreEvent(
      { interests: "🍳 Cuisine" },
      event({ category: "art", title: "Atelier", description: "on parle cuisine" })
    );
    expect(res.score).toBe(2);
    expect(res.reasons[0]).toBe("Lié à 🍳 Cuisine");
  });

  it("intérêt avec emoji et accent (🎬 Cinéma) trouvé sans accent dans la description", () => {
    const res = scoreEvent(
      { interests: "🎬 Cinéma, 🏃 Sport" },
      event({ category: "art", title: "Projection", description: "soirée cinema en plein air" })
    );
    expect(res.score).toBe(2);
    expect(res.reasons[0]).toBe("Lié à 🎬 Cinéma");
  });

  it("un intérêt réduit à un emoji ne matche jamais", () => {
    expect(scoreEvent({ interests: "🍳" }, event({ description: "cuisine" })).score).toBe(0);
  });

  it("+2 si l'événement vient d'une de mes communautés", () => {
    const res = scoreEvent({}, event({ community_id: "c1" }), ["c1", "c2"]);
    expect(res.score).toBe(2);
    expect(res.reasons[0]).toContain("communautés");
  });

  it("pas de bonus communauté si community_id non listé", () => {
    const res = scoreEvent({}, event({ community_id: "cX" }), ["c1"]);
    expect(res.score).toBe(0);
  });

  it("cumul ville + intérêts + communauté", () => {
    const res = scoreEvent(
      { city: "Laval", interests: "musique" },
      event({ city: "Laval", category: "musique", community_id: "c1" }),
      ["c1"]
    );
    expect(res.score).toBe(3 + 2 + 2);
    expect(res.reasons).toHaveLength(3);
  });
});

describe("rankEvents", () => {
  it("trie par score décroissant, attache l'événement et les raisons", () => {
    const user = { city: "Toronto", interests: "sport" };
    const list = [
      event({ title: "loin", city: "Ottawa", category: "art" }),
      event({ title: "proche+sport", city: "Toronto", category: "sport" }),
    ];
    const ranked = rankEvents(user, list);
    expect(ranked[0].event.title).toBe("proche+sport");
    expect(ranked[0]).toHaveProperty("reasons");
  });

  it("liste vide -> []", () => {
    expect(rankEvents({}, [])).toEqual([]);
  });
});
