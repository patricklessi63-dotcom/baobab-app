// ============================================================================
// Conseils de sécurité avant une première rencontre (prompt 05, point 4).
//
// Détection heuristique, 100 % locale, d'une intention de se rencontrer en personne dans le
// BROUILLON d'un message : l'utilisateur voit alors, avant d'envoyer, un rappel court et non
// accusatoire (lieu public, prévenir un proche, trajet à soi). Même principe que
// coordinatesGuard.js : aucun blocage, aucune donnée envoyée à un service tiers, rappel masquable.
//
// Ce n'est PAS une garantie de sécurité : un conseil peut s'afficher pour rien (faux positif) ou
// manquer (faux négatif). On préfère des expressions assez précises (« on se voit », « premier
// rendez-vous ») à des mots génériques (« café », « rendez-vous » seuls : « j'ai un rendez-vous
// chez le médecin ») pour ne pas encombrer les conversations ordinaires.
//
// Comparaison normalisée comme moneyGuard.js : accents, casse et apostrophes (droite, courbe ou
// absente) ne changent rien au résultat.
// ============================================================================
import { normalizeForSearch } from "./searchQuery.js";

const APOSTROPHES_RE = /['’ʼ`]/g;
const normalize = (text) => normalizeForSearch(text).replace(APOSTROPHES_RE, "");

const MEETING_KEYWORDS = [
  // français
  "on se voit",
  "on se rencontre",
  "on se retrouve",
  "se rencontrer",
  "te rencontrer",
  "me rencontrer",
  "te voir en vrai",
  "se voir en vrai",
  "premiere rencontre",
  "premier rendez",
  "rendez-vous avec toi",
  "un rendez-vous ensemble",
  "prendre un cafe",
  "prendre un verre",
  "diner ensemble",
  "souper ensemble",
  "sortir ensemble",
  "viens chez moi",
  "je viens chez toi",
  "passer chez toi",
  // anglais
  "meet up",
  "meet in person",
  "meet you in person",
  "meet for coffee",
  "grab a coffee",
  "grab a drink",
  "first date",
  "come over",
];

const MATCHERS = MEETING_KEYWORDS.map((kw) => normalize(kw)).filter(Boolean);

export const MEETING_TIP_MESSAGE =
  "Une première rencontre en vue ? Choisis un lieu public et fréquenté, préviens un proche de l'endroit et de l'heure, et organise ton propre trajet. Tu peux signaler une conversation à tout moment.";

export function detectMeetingIntent(text) {
  const value = (text || "").trim();
  if (!value) return false;
  const normalized = normalize(value);
  return MATCHERS.some((kw) => normalized.includes(kw));
}
