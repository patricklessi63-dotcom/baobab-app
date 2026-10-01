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

  // --- Audit normalisation (30/09/2026) ---------------------------------

  it("détecte une demande d'argent même sans apostrophe (élision tapée collée)", () => {
    // Très fréquent en français familier/texto : "largent" au lieu de
    // "l'argent". Avant le correctif, un simple .toLowerCase() ne trouvait
    // pas ce cas puisque le mot-clé exige une apostrophe droite.
    const r = detectMoneyRequest("stp envoie-moi de largent");
    expect(r.flagged).toBe(true);
    expect(r.categories).toContain("money");
  });

  it("détecte une demande d'argent avec une apostrophe courbe (correction automatique iOS/Mac)", () => {
    const r = detectMoneyRequest("j’ai besoin d’argent très vite");
    expect(r.flagged).toBe(true);
    expect(r.categories).toContain("money");
  });

  it("détecte un mot-clé accentué même tapé sans accent (cohérence avec normalizeForSearch)", () => {
    // "urgence financière" n'avait pas de doublon sans accent dans la liste,
    // contrairement à d'autres entrées — un vrai trou de couverture.
    const r = detectMoneyRequest("c'est une urgence financiere, aide-moi");
    expect(r.flagged).toBe(true);
    expect(r.categories).toContain("money");
  });

  // --- Audit faux positifs culturels (30/09/2026) ------------------------

  it("ne signale pas un virement bancaire mentionné dans un contexte ordinaire", () => {
    // Discussion normale et fréquente pour un public immigrant (envoyer de
    // l'argent à sa famille) : ne doit pas déclencher l'avertissement "ne
    // fais jamais de virement à quelqu'un rencontré sur Baobab".
    const r = detectMoneyRequest("Je dois faire un virement à ma famille au pays ce soir");
    expect(r.flagged).toBe(false);
  });

  it("ne signale pas une annonce de fiançailles/mariage légitime comme arnaque sentimentale", () => {
    const r = detectMoneyRequest("Il m'a fait sa demande en mariage hier, je suis trop contente, on se marie l'été prochain");
    expect(r.flagged).toBe(false);
  });
});
