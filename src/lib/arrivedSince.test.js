import { describe, it, expect } from "vitest";
import {
  isArrivalMonth, monthsSinceArrival, arrivalMonthFromText, formatDuration,
  displayArrivedSince, toEditableArrivedSince, resolveArrivedSinceForSave,
} from "./arrivedSince.js";
import { arrivedMonths, isRecentArrival, matchesArrivalStage, ARRIVAL_STAGE_OPTIONS } from "./arrivalStage.js";

const NOW = new Date(2026, 10, 3); // 3 novembre 2026 (mois index 10)

describe("monthsSinceArrival", () => {
  it("compte les mois écoulés depuis un mois d'arrivée", () => {
    expect(monthsSinceArrival("2026-11", NOW)).toBe(0);
    expect(monthsSinceArrival("2026-03", NOW)).toBe(8);
    expect(monthsSinceArrival("2023-11", NOW)).toBe(36);
  });
  it("une date future ne donne pas de durée négative", () => {
    expect(monthsSinceArrival("2027-05", NOW)).toBe(0);
  });
  it("reste compatible avec les anciennes saisies (durée figée)", () => {
    expect(monthsSinceArrival("8 mois", NOW)).toBe(8);
    expect(monthsSinceArrival("3 ans", NOW)).toBe(36);
    expect(monthsSinceArrival("1 an", NOW)).toBe(12);
  });
  it("valeur inexploitable : null", () => {
    expect(monthsSinceArrival("", NOW)).toBeNull();
    expect(monthsSinceArrival("bientôt", NOW)).toBeNull();
    expect(monthsSinceArrival("2026-13", NOW)).toBeNull();
  });
});

describe("la durée VIEILLIT avec le temps (le bug)", () => {
  const stored = arrivalMonthFromText("3 mois", new Date(2026, 0, 15)); // saisi en janvier 2026
  it("« 3 mois » saisi en janvier 2026 vaut 3 mois en janvier", () => {
    expect(stored).toBe("2025-10");
    expect(displayArrivedSince(stored, new Date(2026, 0, 15))).toBe("3 mois");
  });
  it("…et 13 mois en novembre 2026, puis plus de 2 ans en 2028", () => {
    expect(displayArrivedSince(stored, NOW)).toBe("13 mois");
    expect(displayArrivedSince(stored, new Date(2028, 0, 15))).toBe("2 ans et 3 mois");
  });
  it("une ancienne saisie figée s'affiche telle quelle", () => {
    expect(displayArrivedSince("3 mois", NOW)).toBe("3 mois");
  });
});

describe("formatDuration", () => {
  it("formate en français", () => {
    expect(formatDuration(0)).toBe("moins d'un mois");
    expect(formatDuration(1)).toBe("1 mois");
    expect(formatDuration(23)).toBe("23 mois");
    expect(formatDuration(24)).toBe("2 ans");
    expect(formatDuration(30)).toBe("2 ans et 6 mois");
    expect(formatDuration(-1)).toBe("");
  });
});

describe("arrivalMonthFromText", () => {
  it("convertit une durée en mois d'arrivée", () => {
    expect(arrivalMonthFromText("0 mois", NOW)).toBe("2026-11");
    expect(arrivalMonthFromText("8 mois", NOW)).toBe("2026-03");
    expect(arrivalMonthFromText("2 ans", NOW)).toBe("2024-11");
    expect(arrivalMonthFromText("1 an", NOW)).toBe("2025-11");
  });
  it("saisie invalide ou antérieure à l'an 0 : null", () => {
    expect(arrivalMonthFromText("abc", NOW)).toBeNull();
    expect(arrivalMonthFromText("", NOW)).toBeNull();
    expect(arrivalMonthFromText("999999 ans", NOW)).toBeNull();
  });
});

describe("toEditableArrivedSince / resolveArrivedSinceForSave", () => {
  it("un mois d'arrivée devient « N mois » (< 2 ans) ou « N ans » (arrondi)", () => {
    expect(toEditableArrivedSince("2026-03", NOW)).toBe("8 mois");
    expect(toEditableArrivedSince("2023-11", NOW)).toBe("3 ans");
    expect(toEditableArrivedSince("3 mois", NOW)).toBe("3 mois"); // ancienne saisie : inchangée
    expect(toEditableArrivedSince("", NOW)).toBe("");
  });
  it("champ non modifié : on garde la date stockée (pas de dérive à chaque enregistrement)", () => {
    expect(resolveArrivedSinceForSave("3 ans", "2023-11", NOW)).toBe("2023-11");
  });
  it("champ modifié : la nouvelle durée est encodée", () => {
    expect(resolveArrivedSinceForSave("5 ans", "2023-11", NOW)).toBe("2021-11");
  });
  it("première saisie (rien de stocké) ou ancienne valeur modifiée : encodée", () => {
    expect(resolveArrivedSinceForSave("8 mois", "", NOW)).toBe("2026-03");
    expect(resolveArrivedSinceForSave("1 an", "3 mois", NOW)).toBe("2025-11");
  });
  it("champ vidé : chaîne vide", () => {
    expect(resolveArrivedSinceForSave("  ", "2023-11", NOW)).toBe("");
  });
});

describe("filtres d'installation : utilisent la durée calculée", () => {
  it("arrivedMonths comprend les deux formats", () => {
    expect(arrivedMonths("8 mois")).toBe(8);
    const now = new Date();
    const y = now.getFullYear(); const m = now.getMonth();
    const twoYearsAgo = `${y - 2}-${String(m + 1).padStart(2, "0")}`;
    expect(arrivedMonths(twoYearsAgo)).toBe(24);
  });
  it("isRecentArrival et matchesArrivalStage suivent le temps qui passe", () => {
    const now = new Date();
    const y = now.getFullYear(); const m = now.getMonth() + 1;
    const recent = `${y}-${String(m).padStart(2, "0")}`;
    const old = `${y - 4}-${String(m).padStart(2, "0")}`;
    expect(isRecentArrival({ arrived_since: recent })).toBe(true);
    expect(isRecentArrival({ arrived_since: old })).toBe(false);
    expect(matchesArrivalStage({ arrived_since: old }, ARRIVAL_STAGE_OPTIONS[2])).toBe(true);
  });
  it("isArrivalMonth", () => {
    expect(isArrivalMonth("2025-03")).toBe(true);
    expect(isArrivalMonth("3 mois")).toBe(false);
  });
});
