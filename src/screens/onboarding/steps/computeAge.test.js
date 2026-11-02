import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

// Fuseau canadien (UTC-5/-4) imposé AVANT tout usage de Date : c'est là que new Date("AAAA-MM-JJ")
// (minuit UTC) recule d'un jour en heure locale.
beforeAll(() => { process.env.TZ = "America/Toronto"; });
afterEach(() => vi.useRealTimers());

import { computeAge } from "./Step1Identity";

describe("computeAge — date de naissance « AAAA-MM-JJ » au Canada", () => {
  it("la veille de l'anniversaire, l'âge n'est pas encore incrémenté", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 14, 12, 0, 0)); // 14 mars 2026, midi local
    expect(computeAge("2000-03-15")).toBe(25);
  });

  it("le jour de l'anniversaire, l'âge est incrémenté", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 0, 5, 0)); // 15 mars 2026, 00 h 05 local
    expect(computeAge("2000-03-15")).toBe(26);
  });

  it("1er janvier : ni l'année ni le mois ne reculent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    expect(computeAge("2000-01-01")).toBe(26);
    vi.setSystemTime(new Date(2025, 11, 31, 12, 0, 0));
    expect(computeAge("2000-01-01")).toBe(25);
  });

  it("valeurs invalides ou vides", () => {
    expect(computeAge("")).toBeNull();
    expect(computeAge(null)).toBeNull();
    expect(computeAge("pas-une-date")).toBeNull();
  });
});
