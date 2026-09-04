// Parcours Canada (arrived_since) — texte libre saisi à l'onboarding
// (Step4CanadaJourney, ex. "8 mois", "3 ans"). Centralisé ici pour que le
// filtre "Étape d'installation" de DiscoverTab et la section "Nouveaux au
// Canada" de FeedTab (via SocialShell) utilisent la même définition d'une
// arrivée "récente" — voir bug corrigé dans SocialShell.jsx (newArrivals).
export const ARRIVAL_STAGE_OPTIONS = ["🌱 Vient d'arriver (< 1 an)", "1 à 3 ans", "3 à 5 ans", "5 ans et plus"];

export function arrivedMonths(str) {
  const m = String(str || "").trim().match(/^(\d+)\s*(mois|ans?|ann[ée]es?)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /an/i.test(m[2]) ? n * 12 : n;
}

export function matchesArrivalStage(p, stage) {
  const months = arrivedMonths(p.arrived_since);
  if (months === null) return false;
  if (stage === ARRIVAL_STAGE_OPTIONS[0]) return months < 12;
  if (stage === ARRIVAL_STAGE_OPTIONS[1]) return months >= 12 && months < 36;
  if (stage === ARRIVAL_STAGE_OPTIONS[2]) return months >= 36 && months < 60;
  if (stage === ARRIVAL_STAGE_OPTIONS[3]) return months >= 60;
  return true;
}

// "Nouvel arrivant" — même seuil (< 1 an) que le premier palier du filtre
// "Étape d'installation" ci-dessus, pour que le badge/la section "Nouveaux
// au Canada" affichée ailleurs dans l'app corresponde à la même définition.
export function isRecentArrival(p) {
  const months = arrivedMonths(p.arrived_since);
  return months !== null && months < 12;
}
