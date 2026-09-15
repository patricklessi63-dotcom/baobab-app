import { describe, it, expect } from "vitest";
import { escapeLikePattern, escapeOrFilterValue, normalizeForSearch } from "./searchQuery.js";

// Ces deux fonctions échappent une saisie utilisateur libre AVANT de la
// concaténer dans un filtre PostgREST `ilike` / `or`. Un défaut ici = requête
// cassée (400) ou, pire, injection d'une condition de filtre arbitraire.

describe("escapeLikePattern", () => {
  it("échappe le joker '%' (n'importe quelle suite de caractères)", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("%%%")).toBe("\\%\\%\\%");
  });

  it("échappe le joker '_' (un caractère quelconque)", () => {
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("___")).toBe("\\_\\_\\_");
  });

  it("échappe le backslash lui-même", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("échappe le backslash EN PREMIER (pas de double échappement des jokers ajoutés)", () => {
    // "\%" (2 car.) -> "\\%" -> "\\\%" (4 car.) : le backslash d'origine est
    // doublé, puis le % gagne son propre backslash d'échappement.
    expect(escapeLikePattern("\\%")).toBe("\\\\\\%");
    // "\_" -> "\\_" -> "\\\_"
    expect(escapeLikePattern("\\_")).toBe("\\\\\\_");
  });

  it("gère un mélange des trois métacaractères", () => {
    expect(escapeLikePattern("%_\\")).toBe("\\%\\_\\\\");
    expect(escapeLikePattern("50%_off\\now")).toBe("50\\%\\_off\\\\now");
  });

  it("ne touche PAS aux caractères réservés de .or() (virgule, parenthèses, guillemet, étoile)", () => {
    // escapeLikePattern ne gère QUE les jokers LIKE — la protection virgule/
    // parenthèses est le rôle de escapeOrFilterValue + guillemets côté appelant.
    expect(escapeLikePattern("Montréal, QC")).toBe("Montréal, QC");
    expect(escapeLikePattern("a(b)c")).toBe("a(b)c");
    expect(escapeLikePattern('say "hi"')).toBe('say "hi"');
    expect(escapeLikePattern("a*b")).toBe("a*b");
  });

  it("laisse une chaîne vide inchangée", () => {
    expect(escapeLikePattern("")).toBe("");
  });

  it("préserve l'unicode (accents, emoji, idéogrammes)", () => {
    expect(escapeLikePattern("café ☕ 日本語 🇨🇦")).toBe("café ☕ 日本語 🇨🇦");
  });

  it("coerce les entrées non-string via String()", () => {
    expect(escapeLikePattern(50)).toBe("50");
    expect(escapeLikePattern(null)).toBe("null");
    expect(escapeLikePattern(undefined)).toBe("undefined");
    expect(escapeLikePattern(true)).toBe("true");
  });

  it("neutralise une tentative d'utiliser les jokers pour élargir le match", () => {
    // Un attaquant tape "%" pour tout matcher : après échappement c'est un
    // littéral, la recherche ne matche que le texte "%".
    expect(escapeLikePattern("%")).toBe("\\%");
    expect(escapeLikePattern("admin%")).toBe("admin\\%");
  });
});

describe("escapeOrFilterValue", () => {
  it("échappe le guillemet double (délimiteur de valeur dans .or())", () => {
    expect(escapeOrFilterValue('a"b')).toBe('a\\"b');
  });

  it("échappe le backslash", () => {
    expect(escapeOrFilterValue("a\\b")).toBe("a\\\\b");
  });

  it("échappe le backslash en premier", () => {
    // '\"' (backslash + guillemet) -> '\\"' -> '\\\"'
    expect(escapeOrFilterValue('\\"')).toBe('\\\\\\"');
  });

  it("laisse virgule et parenthèses TELLES QUELLES (neutralisées par les guillemets de l'appelant)", () => {
    // Vérifié empiriquement dans le module source : or=(name.ilike."%a, b%")
    // est accepté, la virgule dans la valeur entre guillemets n'est plus un
    // séparateur — donc pas besoin de l'échapper ici.
    expect(escapeOrFilterValue("Montréal, QC")).toBe("Montréal, QC");
    expect(escapeOrFilterValue("Ville (nouvelle)")).toBe("Ville (nouvelle)");
  });

  it("ne touche pas aux jokers LIKE (rôle de escapeLikePattern)", () => {
    expect(escapeOrFilterValue("100%")).toBe("100%");
    expect(escapeOrFilterValue("a_b")).toBe("a_b");
  });

  it("laisse une chaîne vide inchangée", () => {
    expect(escapeOrFilterValue("")).toBe("");
  });

  it("préserve l'unicode", () => {
    expect(escapeOrFilterValue("café ☕ 日本語 🇨🇦")).toBe("café ☕ 日本語 🇨🇦");
  });

  it("coerce les entrées non-string via String()", () => {
    expect(escapeOrFilterValue(50)).toBe("50");
    expect(escapeOrFilterValue(null)).toBe("null");
    expect(escapeOrFilterValue(undefined)).toBe("undefined");
  });

  it("neutralise une tentative d'injection de condition de filtre PostgREST", () => {
    // Sans échappement, cette valeur — une fois placée entre guillemets par
    // l'appelant : name.ilike."<VALEUR>" — refermerait le guillemet et
    // injecterait une condition arbitraire (id.eq.1). Les guillemets internes
    // échappés empêchent la sortie du contexte "valeur".
    const inj = 'x",id.eq.1,name.ilike."y';
    expect(escapeOrFilterValue(inj)).toBe('x\\",id.eq.1,name.ilike.\\"y');
    // Plus aucun guillemet nu ne subsiste (tous précédés d'un backslash).
    expect(escapeOrFilterValue(inj).replace(/\\"/g, "")).not.toContain('"');
  });

  it("neutralise une tentative d'évasion via backslash + guillemet", () => {
    // "\\\"" : l'attaquant pré-échappe son guillemet en espérant que notre
    // échappement le "dé-échappe". Backslash traité en premier -> le sien est
    // doublé, le nôtre s'ajoute : le guillemet reste inerte.
    expect(escapeOrFilterValue('a\\"b')).toBe('a\\\\\\"b');
  });
});

// normalizeForSearch sert aux recherches purement client (liste de
// conversations, messages d'une conversation, actualités immigration, header
// SocialShell...) : contrairement à escapeLikePattern/escapeOrFilterValue
// ci-dessus (qui sécurisent un filtre ILIKE côté serveur, insensible à la
// casse mais PAS aux accents), celle-ci doit rendre la comparaison
// insensible À LA FOIS aux accents et à la casse, des deux côtés (saisie ET
// donnée), pour une app 100% francophone où beaucoup de noms/villes portent
// des accents (Montréal, René, Éducation...).
describe("normalizeForSearch", () => {
  it("retire les accents/diacritiques (clavier anglais, saisie sans accent)", () => {
    expect(normalizeForSearch("Montréal")).toBe("montreal");
    expect(normalizeForSearch("Montreal")).toBe("montreal");
    expect(normalizeForSearch("Éducation")).toBe("education");
    expect(normalizeForSearch("René")).toBe("rene");
    expect(normalizeForSearch("Québec, ça va bien !")).toBe("quebec, ca va bien !");
  });

  it("est insensible à la casse", () => {
    expect(normalizeForSearch("MARIE")).toBe("marie");
    expect(normalizeForSearch("marie")).toBe("marie");
    expect(normalizeForSearch("MaRiE")).toBe("marie");
  });

  it("normalise accents et casse ensemble, dans les deux sens de comparaison", () => {
    // Le point exact du bug corrigé : "Montreal" (saisie) doit matcher
    // "MONTRÉAL" (donnée), peu importe lequel des deux porte les accents/la
    // casse d'origine.
    expect(normalizeForSearch("Montreal")).toBe(normalizeForSearch("MONTRÉAL"));
    expect(normalizeForSearch("marie")).toBe(normalizeForSearch("MARIE"));
  });

  it("laisse les espaces internes et la ponctuation intacts (pas un trim)", () => {
    // normalizeForSearch ne fait QUE accents+casse — retirer les espaces en
    // trop (début/fin de saisie) reste la responsabilité de l'appelant
    // (.trim() avant d'appeler cette fonction), comme le fait déjà
    // matchesSearch dans SocialShell.jsx.
    expect(normalizeForSearch("  Marie  ")).toBe("  marie  ");
  });

  it("gère null/undefined/chaîne vide sans lever d'exception", () => {
    expect(normalizeForSearch(null)).toBe("");
    expect(normalizeForSearch(undefined)).toBe("");
    expect(normalizeForSearch("")).toBe("");
  });

  it("préserve les caractères non-latins (pas de perte sur du texte déjà sans diacritique)", () => {
    expect(normalizeForSearch("日本語")).toBe("日本語");
    expect(normalizeForSearch("☕")).toBe("☕");
  });
});
