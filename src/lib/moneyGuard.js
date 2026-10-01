// ============================================================================
// Baobab Protect — détection heuristique de signaux à risque dans le chat
// (arnaque sentimentale, fausse promesse de parrainage, demande
// d'informations sensibles — voir prompt-messagerie-baobab.md).
//
// Ceci N'EST PAS une garantie : ce sont des listes de mots-clés/motifs qui
// déclenchent un avertissement pédagogique, jamais un blocage de la
// conversation. Un message peut être signalé à tort (faux positif) ou passer
// inaperçu (faux négatif) — c'est un compromis accepté volontairement plutôt
// que de risquer d'abîmer une conversation légitime. Isolé dans un module pur
// pour rester facile à étendre ou à remplacer plus tard par une vraie
// modération (ex. appel à un service de détection).
//
// Normalisation (audit du 30/09/2026) : la comparaison se faisait avant via un
// simple `.toLowerCase()`, incohérent avec `normalizeForSearch` (searchQuery.js)
// déjà utilisé ailleurs dans l'app pour toute recherche texte côté client.
// Deux conséquences concrètes :
//  - accents : la liste ne couvrait pas systématiquement les deux variantes
//    (ex. "urgence financière" / "prêt d'argent" n'avaient PAS de doublon sans
//    accent, contrairement à "numéro de carte"/"numero de carte") — un message
//    tapé sans accent ("urgence financiere") passait inaperçu ;
//  - apostrophes : la quasi-totalité des mots-clés les plus critiques
//    contiennent une élision ("l'argent", "j'ai besoin", "t'épouser"...). Une
//    apostrophe courbe ’ (très fréquente avec la correction automatique
//    iOS/Mac — déjà vu pour "œ"/"æ" dans searchQuery.js) ou son absence totale
//    (élision tapée collée, courante en français familier/texto : "largent",
//    "jai besoin") ne correspondait à AUCUNE entrée de la liste, qui n'utilise
//    que l'apostrophe droite ' — un message "ENVOIE-MOI DE L'ARGENT" avec
//    apostrophe courbe, ou "envoie-moi de largent" sans apostrophe, échappait
//    donc totalement à la détection alors que l'intention est identique.
// On réutilise normalizeForSearch (accents + casse) et on retire en plus
// toute apostrophe (droite, courbe, ou en accent grave de clavier) des deux
// côtés de la comparaison avant de chercher les sous-chaînes.
// ============================================================================
import { normalizeForSearch } from "./searchQuery.js";

const APOSTROPHES_RE = /['’ʼ`]/g;

function normalizeForMatch(text) {
  return normalizeForSearch(text).replace(APOSTROPHES_RE, "");
}

const MONEY_KEYWORDS = [
  "envoie-moi de l'argent",
  "envoie moi de l'argent",
  "j'ai besoin d'argent",
  "besoin d'argent urgent",
  "urgence financière",
  "prête-moi",
  "prete moi",
  "prêt d'argent",
  // "virement" seul retiré (audit du 30/09/2026) : c'est le mot le plus
  // générique de toute la liste (= "transfert bancaire") et déclenchait
  // l'avertissement "ne fais jamais de virement" sur des messages tout à
  // fait légitimes et probablement très fréquents pour ce public immigrant
  // (envoyer de l'argent à sa famille restée au pays, virement Interac pour
  // le loyer, virement de paie...). Les services de transfert réellement
  // associés aux arnaques (Western Union, MoneyGram, mandat cash) restent
  // couverts explicitement ci-dessous, tout comme les demandes directes
  // ("envoie-moi de l'argent", "j'ai besoin d'argent"...) : la couverture
  // du signal "demande d'argent" n'est donc pas significativement réduite.
  "western union",
  "moneygram",
  "mandat cash",
  "carte cadeau",
  "carte-cadeau",
  "gift card",
  "bitcoin",
  "crypto",
  "numéro de carte",
  "numero de carte",
  "code cvv",
  "mot de passe bancaire",
  "coordonnées bancaires",
  "coordonnees bancaires",
];

// NAS + documents d'immigration — jamais légitimement demandés par un autre
// utilisateur, seulement par des organismes officiels.
const IMMIGRATION_DOC_KEYWORDS = [
  "numéro d'assurance sociale",
  "numero d'assurance sociale",
  "assurance sociale",
  "social insurance number",
  "ton nas",
  "confirmation de résidence permanente",
  "confirmation de residence permanente",
  "numéro de dossier ircc",
  "numero de dossier ircc",
  "photo de ton passeport",
  "copie de ton passeport",
  "photo de ta carte rp",
  "photo de ton permis de travail",
];

// Promesse de mariage/parrainage rapide — signal classique d'arnaque
// sentimentale ciblant spécifiquement une population immigrante.
const SPONSORSHIP_KEYWORDS = [
  "je vais te parrainer",
  "te parrainer rapidement",
  "parrainage rapide",
  "mariage blanc",
  // "on se marie" / "on va se marier" / "demande en mariage" retirés (audit
  // du 30/09/2026) : contrairement aux autres entrées de cette liste, ces
  // trois phrases ne portent aucun marqueur de précipitation ou de fraude
  // ("rapide", "blanc"...) — ce sont simplement les mots qu'utiliserait un
  // couple réel annonçant de bonne foi ses fiançailles/son mariage, ce qui
  // arrive normalement sur une appli de rencontre, y compris après un vrai
  // parrainage de conjoint. Les retirer évite d'accueillir une annonce de
  // fiançailles légitime par un avertissement "signal classique d'arnaque
  // sentimentale", sans réduire la détection des promesses rapides/suspectes
  // (toujours couvertes par "parrainage rapide", "te parrainer rapidement",
  // "mariage blanc", "épouse-moi"...).
  "épouse-moi",
  "epouse-moi",
  "je veux t'épouser",
  "je veux t'epouser",
];

// Pression pour quitter la plateforme — précède souvent une arnaque, en
// sortant la conversation de tout mécanisme de signalement/modération.
const LEAVE_PLATFORM_KEYWORDS = [
  "continuons sur whatsapp",
  "donne-moi ton whatsapp",
  "donne moi ton whatsapp",
  "ajoute-moi sur whatsapp",
  "hors de l'application",
  "hors de l'app",
  "parlons ailleurs",
  "quitte baobab",
];

// Motif générique d'IBAN (2 lettres + 2 chiffres + 10 à 30 caractères
// alphanumériques), suffisant pour repérer une tentative de partage de RIB.
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i;

const CATEGORY_MESSAGES = {
  money: "Ce message pourrait être une demande d'argent. Ne partage jamais tes informations bancaires et ne fais jamais de virement à quelqu'un rencontré sur Baobab.",
  immigration_doc: "Ce message pourrait demander une information sensible (NAS, documents d'immigration). Aucun organisme officiel ne les demande par message privé sur une appli de rencontre.",
  sponsorship: "Une promesse de mariage ou de parrainage rapide est un signal classique d'arnaque sentimentale. Prends ton temps, vérifie, et signale si tu as un doute.",
  leave_platform: "On te propose de continuer ailleurs qu'ici ? Reste prudent(e) : sortir de Baobab retire aussi la possibilité de signaler facilement.",
};
const CATEGORY_PRIORITY = ["immigration_doc", "sponsorship", "money", "leave_platform"];

// Normalisé une seule fois par liste (au chargement du module) plutôt qu'à
// chaque appel de detectMoneyRequest : les listes sont figées, pas besoin de
// refaire le travail de normalizeForMatch sur chaque mot-clé à chaque frappe.
function buildMatchers(keywords) {
  return keywords.map((kw) => ({ original: kw, normalized: normalizeForMatch(kw) }));
}

const MONEY_MATCHERS = buildMatchers(MONEY_KEYWORDS);
const IMMIGRATION_DOC_MATCHERS = buildMatchers(IMMIGRATION_DOC_KEYWORDS);
const SPONSORSHIP_MATCHERS = buildMatchers(SPONSORSHIP_KEYWORDS);
const LEAVE_PLATFORM_MATCHERS = buildMatchers(LEAVE_PLATFORM_KEYWORDS);

function matchKeywords(normalizedText, matchers) {
  // Dédoublonne par forme normalisée : avec les accents normalisés, deux
  // entrées comme "numéro de carte"/"numero de carte" correspondent toutes
  // les deux au même texte — on ne garde que la première pour ne pas
  // remonter deux fois "le même" terme dans matchedTerms.
  const seen = new Set();
  const result = [];
  for (const { original, normalized } of matchers) {
    if (normalized && normalizedText.includes(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(original);
    }
  }
  return result;
}

export function detectMoneyRequest(text) {
  const value = (text || "").trim();
  if (!value) return { flagged: false, matchedTerms: [], categories: [], message: "" };

  const normalized = normalizeForMatch(value);
  const byCategory = {
    money: matchKeywords(normalized, MONEY_MATCHERS),
    immigration_doc: matchKeywords(normalized, IMMIGRATION_DOC_MATCHERS),
    sponsorship: matchKeywords(normalized, SPONSORSHIP_MATCHERS),
    leave_platform: matchKeywords(normalized, LEAVE_PLATFORM_MATCHERS),
  };
  if (IBAN_PATTERN.test(value)) byCategory.money.push("format IBAN détecté");

  const categories = CATEGORY_PRIORITY.filter((c) => byCategory[c].length > 0);
  const matchedTerms = categories.flatMap((c) => byCategory[c]);

  return {
    flagged: categories.length > 0,
    matchedTerms,
    categories,
    // Signal le plus prioritaire seulement — un seul nudge à la fois, pas un
    // mur de texte si plusieurs catégories matchent le même message.
    message: categories.length > 0 ? CATEGORY_MESSAGES[categories[0]] : "",
  };
}
