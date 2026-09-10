import { describe, it, expect } from "vitest";
import { detectMoneyRequest } from "./moneyGuard.js";

describe("detectMoneyRequest", () => {
  it("résultat neutre sur texte vide", () => {
    expect(detectMoneyRequest("")).toEqual({ flagged: false, matchedTerms: [], categories: [], message: "" });
    expect(detectMoneyRequest("   ")).toMatchObject({ flagged: false, categories: [] });
    expect(detectMoneyRequest(null)).toMatchObject({ flagged: false });
  });

  it("ne signale pas une conversation ordinaire", () => {
    const r = detectMoneyRequest("On se retrouve au café demain vers 10h ?");
    expect(r.flagged).toBe(false);
  });

  it("détecte une demande d'argent (catégorie money)", () => {
    const r = detectMoneyRequest("S'il te plaît envoie-moi de l'argent, c'est urgent");
    expect(r.flagged).toBe(true);
    expect(r.categories).toContain("money");
    expect(r.message).toBe(
      "Ce message pourrait être une demande d'argent. Ne partage jamais tes informations bancaires et ne fais jamais de virement à quelqu'un rencontré sur Baobab.",
    );
  });

  it("détecte un IBAN via motif et l'ajoute aux termes de la catégorie money", () => {
    const r = detectMoneyRequest("Mon compte : FR7630006000011234567890189 pour le virement");
    expect(r.categories).toContain("money");
    expect(r.matchedTerms).toContain("format IBAN détecté");
  });

  it("détecte une demande de documents d'immigration (insensible à la casse)", () => {
    const r = detectMoneyRequest("Envoie-moi une PHOTO DE TON PASSEPORT stp");
    expect(r.categories).toContain("immigration_doc");
  });

  it("détecte une promesse de parrainage / mariage rapide", () => {
    expect(detectMoneyRequest("je vais te parrainer rapidement une fois mariés").categories).toContain("sponsorship");
  });

  it("détecte une incitation à quitter la plateforme", () => {
    expect(detectMoneyRequest("continuons sur whatsapp, c'est plus simple").categories).toContain("leave_platform");
  });

  it("un seul message = un seul nudge, dans l'ordre de priorité (immigration_doc > money)", () => {
    const r = detectMoneyRequest("donne-moi ton NAS et envoie un virement western union");
    expect(r.categories[0]).toBe("immigration_doc");
    expect(r.message).toMatch(/information sensible/i);
    // Les deux catégories sont bien relevées, immigration_doc en tête.
    expect(r.categories).toEqual(["immigration_doc", "money"]);
  });
});
