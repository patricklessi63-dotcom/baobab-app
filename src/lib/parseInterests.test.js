import { describe, it, expect } from "vitest";
import { parseInterests } from "./parseInterests.js";

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
