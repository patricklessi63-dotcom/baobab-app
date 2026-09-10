import { describe, it, expect } from "vitest";
import {
  arrivedMonths,
  matchesArrivalStage,
  isRecentArrival,
  ARRIVAL_STAGE_OPTIONS,
} from "./arrivalStage.js";

describe("arrivedMonths", () => {
  it("interprète les mois tels quels", () => {
    expect(arrivedMonths("8 mois")).toBe(8);
    expect(arrivedMonths("0 mois")).toBe(0);
  });

  it("convertit les années en mois", () => {
    expect(arrivedMonths("1 an")).toBe(12);
    expect(arrivedMonths("3 ans")).toBe(36);
    expect(arrivedMonths("2 années")).toBe(24);
    expect(arrivedMonths("2 annees")).toBe(24);
  });

  it("tolère l'espace manquant, les espaces autour et la casse", () => {
    expect(arrivedMonths("3ans")).toBe(36);
    expect(arrivedMonths("  5 ANS  ")).toBe(60);
  });

  it("retourne null pour une saisie non reconnue", () => {
    expect(arrivedMonths("")).toBeNull();
    expect(arrivedMonths(null)).toBeNull();
    expect(arrivedMonths("bientôt")).toBeNull();
    expect(arrivedMonths("3 years")).toBeNull();
    expect(arrivedMonths("3.5 ans")).toBeNull();
    expect(arrivedMonths("il y a 3 ans")).toBeNull();
  });
});

describe("matchesArrivalStage", () => {
  const at = (arrived_since) => ({ arrived_since });

  it("retourne false si la durée n'est pas exploitable", () => {
    expect(matchesArrivalStage(at("n'importe quoi"), ARRIVAL_STAGE_OPTIONS[0])).toBe(false);
    expect(matchesArrivalStage(at(null), ARRIVAL_STAGE_OPTIONS[3])).toBe(false);
  });

  it("palier < 1 an", () => {
    expect(matchesArrivalStage(at("6 mois"), ARRIVAL_STAGE_OPTIONS[0])).toBe(true);
    expect(matchesArrivalStage(at("11 mois"), ARRIVAL_STAGE_OPTIONS[0])).toBe(true);
    expect(matchesArrivalStage(at("1 an"), ARRIVAL_STAGE_OPTIONS[0])).toBe(false);
  });

  it("palier 1 à 3 ans (12–35 mois)", () => {
    expect(matchesArrivalStage(at("12 mois"), ARRIVAL_STAGE_OPTIONS[1])).toBe(true);
    expect(matchesArrivalStage(at("2 ans"), ARRIVAL_STAGE_OPTIONS[1])).toBe(true);
    expect(matchesArrivalStage(at("3 ans"), ARRIVAL_STAGE_OPTIONS[1])).toBe(false);
  });

  it("palier 3 à 5 ans (36–59 mois)", () => {
    expect(matchesArrivalStage(at("3 ans"), ARRIVAL_STAGE_OPTIONS[2])).toBe(true);
    expect(matchesArrivalStage(at("59 mois"), ARRIVAL_STAGE_OPTIONS[2])).toBe(true);
    expect(matchesArrivalStage(at("5 ans"), ARRIVAL_STAGE_OPTIONS[2])).toBe(false);
  });

  it("palier 5 ans et plus (>= 60 mois)", () => {
    expect(matchesArrivalStage(at("5 ans"), ARRIVAL_STAGE_OPTIONS[3])).toBe(true);
    expect(matchesArrivalStage(at("10 ans"), ARRIVAL_STAGE_OPTIONS[3])).toBe(true);
    expect(matchesArrivalStage(at("4 ans"), ARRIVAL_STAGE_OPTIONS[3])).toBe(false);
  });

  it("une valeur d'étape inconnue ne filtre pas (retourne true si durée exploitable)", () => {
    expect(matchesArrivalStage(at("2 ans"), "n'importe quoi")).toBe(true);
  });
});

describe("isRecentArrival", () => {
  it("vrai en dessous de 12 mois, faux au-delà ou sans donnée", () => {
    expect(isRecentArrival({ arrived_since: "3 mois" })).toBe(true);
    expect(isRecentArrival({ arrived_since: "11 mois" })).toBe(true);
    expect(isRecentArrival({ arrived_since: "1 an" })).toBe(false);
    expect(isRecentArrival({ arrived_since: "" })).toBe(false);
    expect(isRecentArrival({})).toBe(false);
  });

  it("utilise exactement le même seuil que le premier palier du filtre", () => {
    const p = { arrived_since: "11 mois" };
    expect(isRecentArrival(p)).toBe(matchesArrivalStage(p, ARRIVAL_STAGE_OPTIONS[0]));
  });
});
