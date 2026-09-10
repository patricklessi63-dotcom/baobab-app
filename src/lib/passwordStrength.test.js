import { describe, it, expect } from "vitest";
import { scorePassword, passwordMeetsMinimum } from "./passwordStrength.js";

describe("scorePassword", () => {
  it("mot de passe vide : score 0, label vide, tous les checks à false", () => {
    const r = scorePassword("");
    expect(r.score).toBe(0);
    expect(r.label).toBe("");
    expect(r.checks).toEqual({ length: false, upper: false, lower: false, digit: false, special: false });
  });

  it("calcule correctement les checks de classes de caractères", () => {
    expect(scorePassword("Abcdef1!").checks).toEqual({
      length: true, upper: true, lower: true, digit: true, special: true,
    });
    expect(scorePassword("abc").checks).toMatchObject({ length: false, upper: false, lower: true });
  });

  it("pénalise une séquence clavier/alphabet évidente", () => {
    // "abcdefgh" : +1 longueur, puis -1 séquence ("abcd") => 0
    expect(scorePassword("abcdefgh").score).toBe(0);
    // séquence numérique renversée compte aussi
    expect(scorePassword("Zx4321qw").score).toBeLessThan(scorePassword("Zx4197qw").score);
  });

  it("pénalise 3 caractères identiques consécutifs", () => {
    expect(scorePassword("aaaaaaaa").score).toBe(0);
  });

  it("pénalise fortement (-2) un mot faible connu, même noyé dans le mdp", () => {
    expect(scorePassword("MyBaobab123").score).toBeLessThanOrEqual(1);
    expect(scorePassword("xxPasswordxx1A").score).toBeLessThan(scorePassword("xxTrucbidon1A").score);
  });

  it("récompense longueur + diversité : un mdp solide atteint 4", () => {
    expect(scorePassword("Xk9$mQ2pLwZ7").score).toBe(4);
  });

  it("le score reste borné dans [0, 4] et le label correspond à l'index", () => {
    const LABELS = ["Très faible", "Faible", "Moyen", "Fort", "Très fort"];
    for (const pw of ["a", "abcdefgh", "Abcd1234!", "Abcdefgh1", "Xk9$mQ2pLwZ7", "correct-horse-Battery-9"]) {
      const r = scorePassword(pw);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(4);
      expect(r.label).toBe(LABELS[r.score]);
    }
  });
});

describe("passwordMeetsMinimum", () => {
  it("exige longueur + majuscule + minuscule + chiffre (le spécial reste optionnel)", () => {
    expect(passwordMeetsMinimum({ length: true, upper: true, lower: true, digit: true, special: false })).toBe(true);
    expect(passwordMeetsMinimum({ length: true, upper: true, lower: true, digit: true, special: true })).toBe(true);
  });

  it("échoue si une des quatre conditions obligatoires manque", () => {
    expect(passwordMeetsMinimum({ length: false, upper: true, lower: true, digit: true })).toBe(false);
    expect(passwordMeetsMinimum({ length: true, upper: false, lower: true, digit: true })).toBe(false);
    expect(passwordMeetsMinimum({ length: true, upper: true, lower: false, digit: true })).toBe(false);
    expect(passwordMeetsMinimum({ length: true, upper: true, lower: true, digit: false })).toBe(false);
  });

  it("s'accorde avec les checks renvoyés par scorePassword", () => {
    expect(passwordMeetsMinimum(scorePassword("Abcdef1g").checks)).toBe(true);
    expect(passwordMeetsMinimum(scorePassword("abcdefg1").checks)).toBe(false); // pas de majuscule
  });
});
