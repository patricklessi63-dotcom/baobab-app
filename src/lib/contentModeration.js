// Filtre de texte (insultes, propos discriminatoires, menaces, harcèlement) — français et anglais.
//
// Gratuit et local : aucune API externe. Ce module est le MIROIR EXACT de la fonction SQL
// moderation_normalize() / moderation_check() de supabase-moderation-text.sql : le serveur reste
// l'autorité (déclencheurs sur les tables), ce module donne seulement le retour immédiat dans
// l'application. Toute modification de l'algorithme ici doit être reportée dans le SQL (et
// inversement) ; le test contentModeration.test.js fixe les cas communs.
//
// Principe : on ne compare JAMAIS le texte brut. On produit une forme normalisée (le texte d'origine
// n'est ni modifié ni perdu, il sert toujours à l'affichage et au stockage), puis on cherche chaque
// terme comme MOT ENTIER (ou suite de mots) dans cette forme.

import seed from "../config/moderationTerms.seed.json";

export const MODERATION_REFUSAL =
  "Ce message contient des propos non autorisés. Les récidives entraînent une suspension, puis un bannissement (voir les Conditions d'utilisation).";

// Caractères qui ressemblent à des lettres latines (cyrilliques et grecs courants).
// Les lettres pleine chasse et les formes composées sont ramenées par NFKD plus bas.
export const LOOKALIKE_FROM = "\u0430\u0432\u0441\u0435\u043d\u043a\u043c\u043e\u0440\u0442\u0443\u0445\u0456\u0458\u0455\u03bf\u03b1\u03b5\u03b9\u03bd\u03c4\u03c5\u03c1\u03ba\u03c7";
export const LOOKALIKE_TO   = "abcehkmoptyxijsoaeivtupkx";
// Substitutions « leet » demandées : 0=o 1=i 3=e 4=a 5=s 7=t, plus @ $ € +.
export const LEET_FROM = "013457@$€+";
export const LEET_TO   = "oieastaset";

const ZERO_WIDTH = /[\u200b\u200c\u200d\ufeff\u00ad\u2060]/g;
const COMBINING = /[\u0300-\u036f]/g;

function mapChars(text, from, to) {
  let out = "";
  for (const ch of text) {
    const i = from.indexOf(ch);
    out += i === -1 ? ch : to[i];
  }
  return out;
}

// Forme normalisée : minuscules, sans accents, homoglyphes et « leet » ramenés à des lettres,
// ponctuation en espaces, répétitions de 3+ lettres réduites à 2, lettres isolées recollées
// (« c.o.n.n.a.r.d », « c o n n a r d », « f.d.p »), mots séparés par un seul espace.
export function normalizeForModeration(input) {
  let s = String(input ?? "").toLowerCase();
  s = s.replace(ZERO_WIDTH, "");
  s = s.normalize("NFKD").replace(COMBINING, "");
  s = mapChars(s, LOOKALIKE_FROM, LOOKALIKE_TO);
  s = mapChars(s, LEET_FROM, LEET_TO);
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/(.)\1{2,}/g, "$1$1");
  const tokens = s ? s.split(" ") : [];
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const tok of tokens) {
    if (tok.length === 1) run.push(tok);
    else { flush(); out.push(tok); }
  }
  flush();
  return out.join(" ");
}

// Un terme de la liste est lui aussi normalisé (même chaîne de traitement), sans recollage ni
// réduction : on veut le mot tel qu'on le cherchera dans le texte.
function normalizeTerm(term) {
  let s = String(term ?? "").toLowerCase().replace(ZERO_WIDTH, "");
  s = s.normalize("NFKD").replace(COMBINING, "");
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}

// terms : [{ term, category, severity: "block" | "review" }] ; exceptions : [« pas con », …].
export function buildMatcher(terms = seed.terms, exceptions = seed.exceptions) {
  const exc = exceptions.map(normalizeTerm).filter(Boolean);
  const compiled = [];
  for (const t of terms) {
    const norm = normalizeTerm(t.term);
    if (!norm) continue;
    compiled.push({ ...t, norm, re: new RegExp(`(?:^| )${norm}(?:s|es|x)?(?: |$)`) });
  }
  return { exceptions: exc, terms: compiled };
}

// Résultat : { blocked, flagged, category, term, severity }.
//  - blocked : au moins un terme « block » → le texte est refusé ;
//  - flagged : seulement des termes « review » (ambigus) → accepté mais placé en file de modération.
export function checkText(text, matcher = defaultMatcher()) {
  let norm = " " + normalizeForModeration(text) + " ";
  for (const ex of matcher.exceptions) norm = norm.split(" " + ex + " ").join(" ");
  norm = norm.trim();
  let flagged = null;
  for (const t of matcher.terms) {
    if (!t.re.test(norm)) continue;
    const hit = { category: t.category, term: t.term, severity: t.severity };
    if (t.severity === "block") return { blocked: true, flagged: false, ...hit };
    flagged = flagged || hit;
  }
  return flagged
    ? { blocked: false, flagged: true, ...flagged }
    : { blocked: false, flagged: false, category: null, term: null, severity: null };
}

let cached = null;
export const defaultMatcher = () => (cached ||= buildMatcher());
export const setModerationTerms = (terms, exceptions) => { cached = buildMatcher(terms, exceptions); };
export const resetModerationTerms = () => { cached = null; };
