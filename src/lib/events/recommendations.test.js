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

  it("+2 par intérêt trouvé dans catégorie/titre/description", () => {
    const res = scoreEvent(
      { interests: "sport" },
      event({ category: "sport", title: "Tournoi" })
    );
    expect(res.score).toBe(2);
    expect(res.reasons[0]).toContain("Lié à");
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
