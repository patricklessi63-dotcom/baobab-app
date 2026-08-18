// Configuration centralisée Premium — texte d'AFFICHAGE uniquement.
// Les montants réellement facturés restent toujours ceux définis dans
// Stripe (Price objects, référencés par ID côté Edge Function) — cette
// config ne fait jamais autorité pour la facturation, seulement pour ce
// qui s'affiche à l'écran. Si le prix change dans Stripe, mets-le à jour
// ici aussi pour rester cohérent.

export const PREMIUM_PLANS = [
  {
    id: "monthly",
    label: "Mensuel",
    priceLabel: "9,99 $",
    period: "/mois",
    currency: "CAD",
  },
  {
    id: "yearly",
    label: "Annuel",
    priceLabel: "79,99 $",
    period: "/an",
    currency: "CAD",
    badge: "Économise 33%",
    subLabel: "soit 6,67 $/mois",
  },
];

export const PREMIUM_FEATURES = [
  {
    icon: "🔍",
    label: "Filtres de recherche avancés",
    description: "Affine Découverte par centres d'intérêt, langues parlées et activité récente.",
  },
];

export function planById(id) {
  return PREMIUM_PLANS.find((p) => p.id === id) || null;
}
