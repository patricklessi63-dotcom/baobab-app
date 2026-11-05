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
    key: "advanced_filters",
    icon: "🔍",
    label: "Filtres de recherche avancés",
    description: "Affine Découverte par centres d'intérêt, langues parlées et activité récente.",
  },
  {
    key: "admirers_reveal",
    icon: "💛",
    label: "Vois qui t'a aimé·e en premier",
    description: "Accède à la liste complète de tes admirateur·ice·s et matche sans attendre la réciprocité.",
  },
  {
    key: "premium_badge",
    icon: "✨",
    label: "Badge Premium sur ton profil",
    description: "Un repère de confiance visible partout où ton profil apparaît dans Baobab.",
  },
];

// Fiche détaillée d'un avantage, affichée quand un compte gratuit touche une
// fonction réservée (Paywall) : à quoi ça sert, ce que ça change, et ce qui reste
// gratuit. Une entrée ici = un avantage RÉELLEMENT livré ; ne pas en ajouter
// avant que le code correspondant existe (voir PREMIUM_FEATURES ci-dessus).
export const FEATURE_DETAILS = {
  advanced_filters: {
    title: "Filtres de recherche avancés",
    purpose: "Trouver plus vite les personnes qui te ressemblent.",
    benefits: [
      "Filtrer par centres d'intérêt",
      "Filtrer par langues parlées",
      "Ne voir que les profils actifs récemment",
    ],
    stillFree: "Les filtres de base (ville, intention, étape d'arrivée, profils vérifiés, à proximité) restent gratuits.",
  },
  admirers_reveal: {
    title: "Qui t'a aimé·e en premier",
    purpose: "Savoir qui s'intéresse à toi sans attendre la réciprocité.",
    benefits: [
      "La liste complète des personnes qui t'ont aimé·e",
      "Matcher directement en les aimant en retour",
    ],
    stillFree: "Tu vois déjà combien de personnes t'ont aimé·e, et chaque match mutuel reste gratuit.",
  },
};

// Tableau comparatif Gratuit / Premium (PremiumComparison.jsx). Chaque ligne décrit
// ce que le code fait AUJOURD'HUI : `free` / `premium` valent `true` (inclus),
// `false` (non inclus) ou un court texte. La première ligne (inclus des deux
// côtés) montre que le gratuit reste complet : Premium n'enlève rien.
// Si la monétisation de la messagerie (app_config.monetization_enabled) est un
// jour activée, mettre à jour la ligne « Messagerie ».
export const COMPARISON_ROWS = [
  { icon: "💬", label: "Messagerie, publications, communautés et événements", free: true, premium: true },
  { icon: "🧭", label: "Découverte de profils", free: "Filtres de base", premium: "Filtres de base + avancés" },
  { icon: "🔍", label: "Filtrer par centres d'intérêt, langues et activité récente", free: false, premium: true },
  { icon: "💗", label: "Personnes qui t'ont aimé·e", free: "Le nombre", premium: "La liste complète" },
  { icon: "✨", label: "Badge Premium sur ton profil", free: false, premium: true },
];

export function planById(id) {
  return PREMIUM_PLANS.find((p) => p.id === id) || null;
}
