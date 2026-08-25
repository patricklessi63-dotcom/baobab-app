// ============================================================================
// Baobab 3.0 — restriction géographique du module Rencontres au Canada
// (prompt-geolocalisation-et-ouverture-baobab.md, Partie A).
//
// Boîte englobante volontairement simple (latitude/longitude), pas un appel
// à un service tiers de géocodage inverse : proportionné à une app de
// rencontres (réduire fortement l'accès hors-Canada, pas le rendre
// techniquement impossible — un VPN ou une position falsifiée passeront
// toujours), sans dépendance externe ni exposition de données à un tiers.
// Couvre largement le territoire canadien, y compris le Nord ; imprécis sur
// quelques kilomètres près des frontières (accepté, cohérent avec l'objectif
// affiché de proportionnalité plutôt que de précision absolue).
// ============================================================================
const CANADA_BBOX = { latMin: 41.6, latMax: 83.5, lonMin: -141.1, lonMax: -52.3 };

export function isLikelyInCanada(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  return (
    latitude >= CANADA_BBOX.latMin && latitude <= CANADA_BBOX.latMax &&
    longitude >= CANADA_BBOX.lonMin && longitude <= CANADA_BBOX.lonMax
  );
}

// Un compte déjà établi qui voyage temporairement hors Canada ne perd pas
// l'accès immédiatement — seulement après cette période sans repasser par
// une position canadienne (voir prompt, Partie A : "ne jamais couper l'usage
// d'un compte déjà établi à cause d'un déplacement ponctuel").
export const TRAVEL_GRACE_PERIOD_MS = 60 * 24 * 60 * 60 * 1000;
