// ============================================================================
// Détection heuristique d'un numéro de téléphone ou d'une adresse dans un
// brouillon de message — déclenche un rappel non intrusif ("pense à un lieu
// public pour une première rencontre") AVANT l'envoi, pas après (voir
// prompt-messagerie-baobab.md, section Sécurité). Aucun blocage : l'envoi
// reste toujours possible, le rappel se contente d'informer.
// ============================================================================

// Numéro nord-américain, avec ou sans indicatif/formatage.
const PHONE_PATTERN = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

// Numéro + quelques mots + type de voie — volontairement permissif (faux
// positifs acceptés, jamais de blocage) plutôt que de rater une vraie adresse.
const ADDRESS_PATTERN = /\b\d{1,5}\s+([a-zà-ÿ'-]+\s+){0,3}(rue|avenue|av\.?|boulevard|blvd\.?|chemin|route|rte\.?|street|st\.?|road|rd\.?|drive|dr\.?)\b/i;

export function detectPersonalCoordinates(text) {
  const value = (text || "").trim();
  if (!value) return false;
  return PHONE_PATTERN.test(value) || ADDRESS_PATTERN.test(value);
}
