// « Au Canada depuis… » : durée qui doit VIEILLIR toute seule.
//
// Bug corrigé : profiles.arrived_since était un texte figé saisi une fois (« 3 mois »,
// « 2 ans »). Il ne changeait donc jamais : trois ans après, le profil affichait encore
// « 3 mois », et les filtres « Étape d'installation » / « Nouveaux au Canada » classaient
// la personne de travers. On stocke désormais le MOIS D'ARRIVÉE (« 2025-03 ») dans la même
// colonne texte (aucun changement de base) et on calcule la durée à l'affichage.
//
// Compatibilité : les anciennes valeurs (« 8 mois », « 3 ans ») restent lisibles telles
// quelles (durée figée, comme avant) jusqu'à la prochaine modification du champ.

const ARRIVAL_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const LEGACY_RE = /^(\d+)\s*(mois|ans?|ann[ée]es?)$/i;

export function isArrivalMonth(value) {
  return ARRIVAL_MONTH_RE.test(String(value || "").trim());
}

const monthIndex = (date) => date.getFullYear() * 12 + date.getMonth();

// Mois écoulés depuis l'arrivée (>= 0), ou null si la valeur n'est pas exploitable.
export function monthsSinceArrival(value, now = new Date()) {
  const text = String(value || "").trim();
  const iso = text.match(ARRIVAL_MONTH_RE);
  if (iso) {
    const arrival = Number(iso[1]) * 12 + (Number(iso[2]) - 1);
    return Math.max(0, monthIndex(new Date(now)) - arrival);
  }
  const legacy = text.match(LEGACY_RE);
  if (legacy) {
    const n = Number(legacy[1]);
    return /an/i.test(legacy[2]) ? n * 12 : n;
  }
  return null;
}

// « YYYY-MM » du mois d'arrivée, à partir d'une durée saisie (nombre + unité) ou d'un texte
// « N mois » / « N ans ». null si la saisie est invalide.
export function arrivalMonthFromText(text, now = new Date()) {
  const m = String(text || "").trim().match(LEGACY_RE);
  if (!m) return null;
  const n = Number(m[1]);
  const months = /an/i.test(m[2]) ? n * 12 : n;
  const total = monthIndex(new Date(now)) - months;
  if (!Number.isFinite(total) || total < 0) return null;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function formatDuration(months) {
  if (!Number.isFinite(months) || months < 0) return "";
  if (months < 1) return "moins d'un mois";
  if (months < 24) return `${months} mois`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} ans`;
  return rest === 0 ? y : `${y} et ${rest} mois`;
}

// Texte à afficher après « Au Canada depuis » : durée calculée pour une date d'arrivée,
// valeur d'origine pour une ancienne saisie libre.
export function displayArrivedSince(value, now = new Date()) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isArrivalMonth(text)) return formatDuration(monthsSinceArrival(text, now));
  return text;
}

// Valeur à mettre dans le formulaire (nombre + unité, voir Step4CanadaJourney) : une date
// d'arrivée est convertie en « N mois » (moins de 2 ans) ou « N ans » (arrondi).
export function toEditableArrivedSince(stored, now = new Date()) {
  const text = String(stored || "").trim();
  if (!isArrivalMonth(text)) return text;
  const months = monthsSinceArrival(text, now);
  if (months < 24) return `${months} mois`;
  const years = Math.round(months / 12);
  return `${years} ${years > 1 ? "ans" : "an"}`;
}

// Valeur à enregistrer. Si le champ n'a pas été modifié (même texte éditable qu'à
// l'ouverture), on garde la valeur stockée : ré-encoder un « 2 ans » arrondi décalerait
// la date d'arrivée à chaque enregistrement. Sinon, on encode la nouvelle durée.
export function resolveArrivedSinceForSave(editableText, storedOriginal, now = new Date()) {
  const text = String(editableText || "").trim();
  if (!text) return "";
  const original = String(storedOriginal || "").trim();
  if (original && toEditableArrivedSince(original, now) === text) return original;
  return arrivalMonthFromText(text, now) || text;
}
