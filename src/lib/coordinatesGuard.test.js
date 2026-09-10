import { describe, it, expect } from "vitest";
import { detectPersonalCoordinates } from "./coordinatesGuard.js";

describe("detectPersonalCoordinates", () => {
  it("retourne false sur une entrée vide", () => {
    expect(detectPersonalCoordinates("")).toBe(false);
    expect(detectPersonalCoordinates("   ")).toBe(false);
    expect(detectPersonalCoordinates(null)).toBe(false);
    expect(detectPersonalCoordinates(undefined)).toBe(false);
  });

  it("détecte un numéro de téléphone nord-américain sous plusieurs formes", () => {
    expect(detectPersonalCoordinates("appelle-moi au 514-555-1234")).toBe(true);
    expect(detectPersonalCoordinates("(514) 555-1234")).toBe(true);
    expect(detectPersonalCoordinates("+1 514 555 1234")).toBe(true);
    expect(detectPersonalCoordinates("mon num c'est 5145551234")).toBe(true);
    expect(detectPersonalCoordinates("438.555.9876")).toBe(true);
  });

  it("détecte une adresse (numéro civique + type de voie)", () => {
    expect(detectPersonalCoordinates("j'habite au 1234 rue Sainte-Catherine")).toBe(true);
    expect(detectPersonalCoordinates("passe au 45 boulevard René-Lévesque")).toBe(true);
    expect(detectPersonalCoordinates("12 Main Street")).toBe(true);
    expect(detectPersonalCoordinates("880 avenue du Parc")).toBe(true);
  });

  it("ne signale pas un message ordinaire sans coordonnées", () => {
    expect(detectPersonalCoordinates("on se voit demain au parc ?")).toBe(false);
    expect(detectPersonalCoordinates("j'ai 3 chats et 2 plantes")).toBe(false);
    expect(detectPersonalCoordinates("rendez-vous à 14h30")).toBe(false);
  });
});
