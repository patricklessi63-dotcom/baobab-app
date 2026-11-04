import { describe, it, expect } from "vitest";
import {
  normalizeForModeration, buildMatcher, checkText, MODERATION_REFUSAL,
  setModerationTerms, resetModerationTerms,
} from "./contentModeration.js";
import seed from "../config/moderationTerms.seed.json";

const blocked = (t) => checkText(t).blocked;

describe("normalizeForModeration", () => {
  it("minuscules, accents retirés, ponctuation en espaces", () => {
    expect(normalizeForModeration("  Éléphant, ÇA va ?! ")).toBe("elephant ca va");
  });
  it("chiffres et symboles courants : 0=o 1=i 3=e 4=a 5=s 7=t @=a $=s", () => {
    expect(normalizeForModeration("m3rde")).toBe("merde");
    expect(normalizeForModeration("c0nnard")).toBe("connard");
    expect(normalizeForModeration("conn@rd")).toBe("connard");
    expect(normalizeForModeration("$alaud")).toBe("salaud");
    expect(normalizeForModeration("7ais-toi")).toBe("tais toi");
  });
  it("lettres isolées recollées (points, espaces, tirets)", () => {
    expect(normalizeForModeration("c.o.n.n.a.r.d")).toBe("connard");
    expect(normalizeForModeration("c o n n a r d")).toBe("connard");
    expect(normalizeForModeration("f.d.p")).toBe("fdp");
    expect(normalizeForModeration("f-d-p")).toBe("fdp");
  });
  it("ne recolle pas deux lettres seules : « j'y ai » reste lisible", () => {
    expect(normalizeForModeration("j'y ai pensé")).toBe("j y ai pense");
  });
  it("répétitions artificielles réduites à deux", () => {
    expect(normalizeForModeration("connnnnard")).toBe("connard");
    expect(normalizeForModeration("meeeerde")).toBe("meerde");
  });
  it("caractères Unicode ressemblants : cyrillique, grec, pleine chasse, invisibles", () => {
    expect(normalizeForModeration("соnnard")).toBe("connard"); // « с » et « о » cyrilliques
    expect(normalizeForModeration("ｃｏｎｎａｒｄ")).toBe("connard"); // pleine chasse
    expect(normalizeForModeration("con​nard")).toBe("connard"); // espace de largeur nulle
    expect(normalizeForModeration("ca­nard")).toBe("canard"); // trait d'union conditionnel
  });
  it("texte vide ou absent", () => {
    expect(normalizeForModeration("")).toBe("");
    expect(normalizeForModeration(null)).toBe("");
    expect(normalizeForModeration(undefined)).toBe("");
  });
});

describe("insultes françaises", () => {
  it.each([
    "connard", "Connard !", "espèce de connasse", "sale salope", "t'es un salaud", "enfoiré", "bâtard",
    "ferme ta gueule", "va te faire foutre", "sale pd", "tarlouze", "sale noir", "bougnoule",
    "retourne dans ton pays", "je vais te tuer", "va crever",
  ])("bloque « %s »", (t) => expect(blocked(t)).toBe(true));

  it("les formes pluriel sont couvertes", () => {
    expect(blocked("bande de connards")).toBe(true);
    expect(blocked("des salauds")).toBe(true);
  });
});

describe("insultes anglaises", () => {
  it.each([
    "fuck you", "you asshole", "what a bitch", "motherfucker", "you slut", "kill yourself",
    "i will kill you", "go back to your country", "faggot", "kys",
  ])("bloque « %s »", (t) => expect(blocked(t)).toBe(true));
});

describe("contournements demandés", () => {
  it.each([
    "conn@rd", "c0nnard", "c.o.n.n.a.r.d", "c o n n a r d", "f.d.p", "m3rde sale", "connnnard",
    "CONNARD", "cönnard", "соnnard", "ｃｏｎｎａｒｄ", "con​nard",
    "sale s.a.l.o.p.e", "s a l o p e",
  ])("reconnaît « %s »", (t) => expect(checkText(t).blocked || checkText(t).flagged).toBe(true));

  it("« m3rde » seule est ambiguë : mise en file, pas refusée", () => {
    const r = checkText("m3rde");
    expect(r.blocked).toBe(false);
    expect(r.flagged).toBe(true);
    expect(r.category).toBe("insulte");
  });
});

describe("limite connue", () => {
  it("lettres espacées sur PLUSIEURS mots d'une expression : non reconnues (recollées en un seul bloc)", () => {
    expect(checkText("f u c k   y o u").blocked).toBe(false);
  });
});

describe("faux positifs (mots entiers seulement)", () => {
  it.each([
    "Je cherche un contact au Canada", "Un concert à Montréal", "Le conseil de quartier", "Confiance et respect",
    "La conférence sur l'immigration", "Un cône de signalisation", "Un canard dans le parc", "Bonne analyse du dossier",
    "Je suis en retard pour le rendez-vous", "Les consommateurs", "Scunthorpe", "Classe de conduite", "Assis au parc",
    "Je suis crevé après le travail", "Ferme la porte s'il te plaît",
  ])("laisse passer « %s »", (t) => {
    const r = checkText(t);
    expect(r.blocked).toBe(false);
    expect(r.flagged).toBe(false);
  });
});

describe("liste d'exceptions", () => {
  it("« pas con » (compliment) n'est ni refusé ni mis en file", () => {
    const r = checkText("il n'est pas con du tout");
    expect(r.flagged).toBe(false);
    expect(r.blocked).toBe(false);
  });
  it("mais un « con » isolé est mis en file de modération", () => {
    const r = checkText("quel con");
    expect(r.blocked).toBe(false);
    expect(r.flagged).toBe(true);
  });
});

describe("gravité : refus ou file de modération", () => {
  it("un terme « block » refuse, un terme « review » signale sans refuser", () => {
    expect(checkText("connard").blocked).toBe(true);
    const r = checkText("idiot");
    expect(r).toMatchObject({ blocked: false, flagged: true, severity: "review" });
  });
  it("un texte propre n'a ni catégorie ni terme", () => {
    expect(checkText("Bonjour, bienvenue au Canada !")).toEqual({
      blocked: false, flagged: false, category: null, term: null, severity: null,
    });
  });
  it("le message de refus est clair et non agressif", () => {
    expect(MODERATION_REFUSAL).toBe("Ce message contient des propos non autorisés.");
  });
});

describe("liste configurable (pas figée dans le code)", () => {
  it("la liste de la base remplace celle de départ, exceptions comprises", () => {
    setModerationTerms([{ term: "zorglub", category: "insulte", severity: "block" }], ["pas zorglub"]);
    try {
      expect(checkText("sale zorglub").blocked).toBe(true);
      expect(checkText("pas zorglub").blocked).toBe(false);
      expect(checkText("connard").blocked).toBe(false); // plus dans la liste active
    } finally {
      resetModerationTerms();
    }
    expect(blocked("connard")).toBe(true);
  });
  it("buildMatcher ignore les termes vides", () => {
    const m = buildMatcher([{ term: "  ", category: "insulte", severity: "block" }], []);
    expect(m.terms).toHaveLength(0);
  });
});

describe("liste de départ", () => {
  it("chaque terme est reconnu par le filtre lui-même (pas de terme mort)", () => {
    for (const t of seed.terms) {
      const r = checkText(`xx ${t.term} yy`);
      expect(r.blocked || r.flagged, t.term).toBe(true);
    }
  });
  it("catégories autorisées uniquement", () => {
    const ok = new Set(["insulte", "racisme", "homophobie", "menace", "harcelement"]);
    for (const t of seed.terms) { expect(ok.has(t.category), t.term).toBe(true); expect(["block", "review"]).toContain(t.severity); }
  });
});

describe("substitutions de symboles (€ et + compris)", () => {
  it("€ vaut e, + vaut t, @ vaut a, $ vaut s", () => {
    expect(normalizeForModeration("m€rde")).toBe("merde");
    expect(normalizeForModeration("sale pu+e")).toBe("sale pute");
    expect(normalizeForModeration("conn@rd")).toBe("connard");
    expect(normalizeForModeration("$alaud")).toBe("salaud");
  });
});
