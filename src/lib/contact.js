import config from "../config/contact.json";

// SOURCE UNIQUE des coordonnées publiques de Baobab (pages Confidentialité,
// Conditions, Suppression de compte, À propos). Rien n'est inventé : tant que le
// propriétaire n'a pas rempli src/config/contact.json, les pages publiques
// renvoient vers le formulaire de signalement DANS l'application (voir
// ContactInfo.jsx). Champs à remplir par le propriétaire (voir STORES.md) :
//  - supportEmail : adresse e-mail de support (exigée par Apple 1.2 / 1.5 et
//    recommandée pour la fiche Google Play ; sert aussi de moyen de demande de
//    suppression de compte hors application) ;
//  - operatorName : nom de l'exploitant (personne ou entité juridique) à afficher
//    comme responsable du traitement des données.
// Adresse « simple » : une seule arobase, un domaine avec au moins un point, aucun
// espace/contrôle ni caractère pouvant casser un lien mailto: ou une injection.
const BAD_CHARS = new Set([..." <>\"'(),;:[]", String.fromCharCode(92)]);

export function cleanSupportEmail(value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v || v.length > 254) return "";
  if ([...v].some((c) => BAD_CHARS.has(c) || c.charCodeAt(0) < 32)) return "";
  const parts = v.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  const labels = parts[1].split(".");
  return labels.length >= 2 && labels.every(Boolean) ? v : "";
}

export function cleanOperatorName(value) {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

export const SUPPORT_EMAIL = cleanSupportEmail(config.supportEmail);
export const OPERATOR_NAME = cleanOperatorName(config.operatorName);

export function supportMailto(subject) {
  if (!SUPPORT_EMAIL) return "";
  return subject ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}` : `mailto:${SUPPORT_EMAIL}`;
}
