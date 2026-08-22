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
// ============================================================================

const MONEY_KEYWORDS = [
  "envoie-moi de l'argent",
  "envoie moi de l'argent",
  "j'ai besoin d'argent",
  "besoin d'argent urgent",
  "urgence financière",
  "prête-moi",
  "prete moi",
  "prêt d'argent",
  "virement",
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
  "on se marie",
  "on va se marier",
  "épouse-moi",
  "epouse-moi",
  "je veux t'épouser",
  "je veux t'epouser",
  "demande en mariage",
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

function matchKeywords(lower, keywords) {
  return keywords.filter((kw) => lower.includes(kw));
}

export function detectMoneyRequest(text) {
  const value = (text || "").trim();
  if (!value) return { flagged: false, matchedTerms: [], categories: [], message: "" };

  const lower = value.toLowerCase();
  const byCategory = {
    money: matchKeywords(lower, MONEY_KEYWORDS),
    immigration_doc: matchKeywords(lower, IMMIGRATION_DOC_KEYWORDS),
    sponsorship: matchKeywords(lower, SPONSORSHIP_KEYWORDS),
    leave_platform: matchKeywords(lower, LEAVE_PLATFORM_KEYWORDS),
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
