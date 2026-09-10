import { describe, it, expect } from "vitest";
import { EMOJI_CATEGORIES, searchEmojis } from "./emojiData.js";

describe("EMOJI_CATEGORIES", () => {
  it("chaque catégorie a id/label/icon et une liste d'emojis {e,k}", () => {
    for (const cat of EMOJI_CATEGORIES) {
      expect(cat.id && cat.label && cat.icon).toBeTruthy();
      expect(Array.isArray(cat.emojis)).toBe(true);
      for (const item of cat.emojis) {
        expect(typeof item.e).toBe("string");
        expect(Array.isArray(item.k)).toBe(true);
      }
    }
  });
});

describe("searchEmojis", () => {
  it("requête vide / espaces -> []", () => {
    expect(searchEmojis("")).toEqual([]);
    expect(searchEmojis("   ")).toEqual([]);
  });

  it("trouve par mot-clé exact", () => {
    const res = searchEmojis("chien");
    expect(res.some((r) => r.e === "🐶")).toBe(true);
  });

  it("correspondance par sous-chaîne du mot-clé (insensible à la casse)", () => {
    const res = searchEmojis("RIR"); // "rire", "mort de rire"...
    expect(res.length).toBeGreaterThan(0);
    expect(res.some((r) => r.e === "😂")).toBe(true);
  });

  it("un mot-clou multi-mots est matché par une sous-chaîne", () => {
    expect(searchEmojis("mort de rire").some((r) => r.e === "🤣")).toBe(true);
  });

  it("requête sans correspondance -> []", () => {
    expect(searchEmojis("zzzznope")).toEqual([]);
  });

  it("peut renvoyer plusieurs emojis pour un mot-clé partagé", () => {
    const res = searchEmojis("amour");
    expect(res.length).toBeGreaterThan(1);
  });

  it("rogne les espaces autour de la requête", () => {
    expect(searchEmojis("  chat  ").some((r) => r.e === "🐱")).toBe(true);
  });
});
