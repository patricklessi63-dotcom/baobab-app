import { describe, it, expect } from "vitest";
import { parseInterests, interestSearchKey, matchInterests } from "./parseInterests.js";
import { INTERESTS_OPTIONS } from "../constants.js";

describe("parseInterests", () => {
  it("découpe sur la virgule et retire les espaces autour de chaque élément", () => {
    expect(parseInterests("Sport, Cuisine ,  Voyage")).toEqual(["Sport", "Cuisine", "Voyage"]);
  });

  it("ignore les segments vides (virgules successives, virgule finale)", () => {
    expect(parseInterests("Sport,,Voyage,")).toEqual(["Sport", "Voyage"]);
    expect(parseInterests("  ,  , Sport")).toEqual(["Sport"]);
  });

  it("retourne un tableau vide pour une entrée absente ou vide", () => {
    expect(parseInterests("")).toEqual([]);
    expect(parseInterests(null)).toEqual([]);
    expect(parseInterests(undefined)).toEqual([]);
    expect(parseInterests("   ")).toEqual([]);
  });

  it("ne découpe QUE sur la virgule (point-virgule et slash restent dans la valeur)", () => {
    expect(parseInterests("Arts; Musique")).toEqual(["Arts; Musique"]);
    expect(parseInterests("Ski/Snowboard")).toEqual(["Ski/Snowboard"]);
  });

  it("ne déduplique pas et ne normalise pas la casse (comportement volontairement brut)", () => {
    expect(parseInterests("Sport, sport, SPORT")).toEqual(["Sport", "sport", "SPORT"]);
  });

  it("préserve les accents et les espaces internes d'un intérêt", () => {
    expect(parseInterests("Jeux de société, Cinéma d'auteur")).toEqual(["Jeux de société", "Cinéma d'auteur"]);
  });
});

describe("interestSearchKey", () => {
  it("retire l'emoji de tête et normalise casse + accents", () => {
    expect(interestSearchKey("🍳 Cuisine")).toBe("cuisine");
    expect(interestSearchKey("🎬 Cinéma")).toBe("cinema");
    expect(interestSearchKey("✍️ Écriture")).toBe("ecriture");
  });

  it("retire aussi les emoji suivis d'un sélecteur de variation (✈️, 🏛️)", () => {
    expect(interestSearchKey("✈️ Voyage")).toBe("voyage");
    expect(interestSearchKey("🏛️ Histoire")).toBe("histoire");
  });

  it("laisse intact un intérêt sans emoji et tolère les entrées vides", () => {
    expect(interestSearchKey("sport")).toBe("sport");
    expect(interestSearchKey("")).toBe("");
    expect(interestSearchKey(null)).toBe("");
  });

  it("donne une clé non vide pour chaque option réelle de INTERESTS_OPTIONS", () => {
    for (const opt of INTERESTS_OPTIONS) {
      const key = interestSearchKey(opt);
      expect(key, opt).not.toBe("");
      expect(key, opt).toMatch(/^[\p{L}\p{N}]/u);
    }
  });
});

describe("matchInterests", () => {
  it("retrouve un intérêt avec emoji dans un texte libre et le renvoie tel quel", () => {
    expect(matchInterests(["🍳 Cuisine", "🏃 Sport"], "on parle cuisine ici")).toEqual(["🍳 Cuisine"]);
  });

  it("est insensible aux accents dans les deux sens", () => {
    expect(matchInterests(["🎬 Cinéma"], "soirée cinema")).toEqual(["🎬 Cinéma"]);
    expect(matchInterests(["cinema"], "Soirée CINÉMA")).toEqual(["cinema"]);
  });

  it("ignore un intérêt sans lettre ni chiffre (sinon il matcherait tout)", () => {
    expect(matchInterests(["🍳", "  "], "n'importe quoi")).toEqual([]);
  });
});
