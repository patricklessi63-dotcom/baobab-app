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

// Uniquement des avantages RÉELLEMENT actifs en prod aujourd'hui — pas de
// promesse en avance sur le code. La messagerie illimitée existe côté SQL
// (supabase-premium-messaging.sql) mais reste désactivée
// (monetization_enabled = false) : elle n'est donc pas listée ici tant
// qu'un·e admin ne l'a pas activée.
export const PREMIUM_FEATURES = [
  {
    icon: "🔍",
    label: "Filtres de recherche avancés",
    description: "Affine Découverte par centres d'intérêt, langues parlées et activité récente.",
  },
  {
    icon: "💛",
    label: "Vois qui t'a aimé·e en premier",
    description: "Accède à la liste complète de tes admirateur·ice·s et matche sans attendre la réciprocité.",
  },
  {
    icon: "✨",
    label: "Badge Premium sur ton profil",
    description: "Un repère de confiance visible partout où ton profil apparaît dans Baobab.",
  },
];

export function planById(id) {
  return PREMIUM_PLANS.find((p) => p.id === id) || null;
}
