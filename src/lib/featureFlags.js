// Drapeaux de lancement (SYNTHESE-PHASE-1.md, amélioration n°9) : tant que Stripe
// et la clé Anthropic ne sont pas posés côté serveur, l'application ne doit pas
// proposer Premium ni les suggestions IA (bouton qui échouerait, paywall sans
// paiement possible). Désactivés par défaut ; pour les activer le jour J, définir
// VITE_FEATURE_PREMIUM=true / VITE_FEATURE_AI=true dans Vercel puis redéployer.
// Fonctions (et non constantes) pour que les tests puissent basculer la valeur.
const on = (v) => v === "true" || v === "1";

export const isPremiumEnabled = () => on(import.meta.env.VITE_FEATURE_PREMIUM);
export const isAiEnabled = () => on(import.meta.env.VITE_FEATURE_AI);

// En dessous de ce nombre de membres, le compteur public de la page d'accueil
// dessert plus qu'il ne rassure (« 4 membres déjà sur Baobab »).
export const MEMBER_COUNT_PUBLIC_MIN = 50;
