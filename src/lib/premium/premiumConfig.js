// Configuration centralisée Premium — texte d'AFFICHAGE uniquement.
// Les montants réellement facturés restent toujours ceux définis dans
// Stripe (Price objects, référencés par ID côté Edge Function) — cette
// config ne fait jamais autorité pour la facturation, seulement pour ce
// qui s'affiche à l'écran. Si le prix change dans Stripe, mets-le à jour
// ici aussi pour rester cohérent.

import { isAiEnabled } from "../featureFlags";

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
    key: "ai_writing_tools",
    icon: "✍️",
    label: "Outils d'écriture IA",
    description: "Corrige ton texte et t'aide à rédiger une publication à partir d'une idée. Une suggestion à relire, jamais publiée sans toi.",
    requiresFlag: "ai",
  },
  {
    key: "private_collections",
    icon: "📚",
    label: "Collections privées de publications",
    description: "Range les publications à retrouver plus tard dans tes collections. Elles restent privées, et tu les gardes même si tu résilies.",
  },
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
  ai_writing_tools: {
    title: "Outils d'écriture IA",
    purpose: "Écrire plus facilement, sans perdre ta voix.",
    benefits: [
      "Corriger l'orthographe et la grammaire de ton texte",
      "Rédiger une publication à partir d'une simple idée",
      "Toujours une suggestion à relire : rien n'est publié sans toi",
    ],
    stillFree: "« Améliorer mon texte » reste gratuit (avec une limite quotidienne). Premium élargit cette limite.",
  },
  private_collections: {
    title: "Collections privées de publications",
    purpose: "Retrouver facilement les publications qui comptent pour toi.",
    benefits: [
      "Jusqu'à 20 collections de ton choix",
      "Jusqu'à 500 publications par collection",
      "Visibles par toi seul·e, toujours",
    ],
    stillFree: "Le fil, les réactions et les commentaires restent gratuits. Si tu résilies, tu gardes tes collections et peux les consulter.",
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
  { icon: "✍️", label: "Corriger et rédiger avec l'IA", free: false, premium: true, requiresFlag: "ai" },
  // 10 / 100 = valeurs PAR DÉFAUT de AI_FREE_PER_DAY / AI_PREMIUM_PER_DAY (ai-assist, _shared/aiPolicy.ts) :
  // si le propriétaire les change dans Supabase, changer ces deux chiffres aussi.
  { icon: "🤖", label: "Suggestions IA par jour", free: "10", premium: "100", requiresFlag: "ai" },
  { icon: "📚", label: "Collections privées de publications", free: false, premium: true },
  { icon: "✨", label: "Badge Premium sur ton profil", free: false, premium: true },
];

// Avantages à afficher aujourd'hui : ceux qui dépendent du service IA n'apparaissent que si le
// drapeau IA est allumé (clé posée, fonction déployée) — on ne vante jamais ce qui ne marche pas.
const available = (item) => item.requiresFlag !== "ai" || isAiEnabled();
export const getPremiumFeatures = () => PREMIUM_FEATURES.filter(available);
export const getComparisonRows = () => COMPARISON_ROWS.filter(available);

export function planById(id) {
  return PREMIUM_PLANS.find((p) => p.id === id) || null;
}
