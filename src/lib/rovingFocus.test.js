import { describe, it, expect } from "vitest";
import { nextIndexForKey } from "./rovingFocus";

describe("nextIndexForKey — navigation clavier dans une rangée", () => {
  it("flèches : suivant / précédent, en boucle aux extrémités", () => {
    expect(nextIndexForKey("ArrowRight", 0, 4)).toBe(1);
    expect(nextIndexForKey("ArrowRight", 3, 4)).toBe(0);
    expect(nextIndexForKey("ArrowLeft", 0, 4)).toBe(3);
    expect(nextIndexForKey("ArrowDown", 1, 4)).toBe(2);
    expect(nextIndexForKey("ArrowUp", 1, 4)).toBe(0);
  });
  it("Début et Fin", () => {
    expect(nextIndexForKey("Home", 2, 4)).toBe(0);
    expect(nextIndexForKey("End", 0, 4)).toBe(3);
  });
  it("autres touches, liste vide ou index hors limites : rien d'inattendu", () => {
    expect(nextIndexForKey("Enter", 0, 4)).toBeNull();
    expect(nextIndexForKey("a", 0, 4)).toBeNull();
    expect(nextIndexForKey("ArrowRight", 0, 0)).toBeNull();
    expect(nextIndexForKey("ArrowRight", 9, 4)).toBe(1);
  });
});
