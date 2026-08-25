// ============================================================================
// Triage automatique des retours "Un souci ? Une idée ?" — catégorisation et
// priorité par mots-clés, PAS une vraie IA sémantique (la fonction Supabase
// ai-assist n'est pas déployée, clé ANTHROPIC_API_KEY absente). C'est un
// compromis assumé : déterministe, transparent, jamais un blocage total —
// l'équipe (via le tableau de bord admin) reste seule décisionnaire, ceci
// ne fait que présélectionner pour gagner du temps de tri.
// ============================================================================

import pkg from "../../package.json";

export const APP_VERSION = pkg.version || "inconnue";

const CATEGORY_KEYWORDS = {
  connexion: ["connexion", "se connecter", "login", "connecter"],
  inscription: ["inscription", "s'inscrire", "créer un compte", "creer un compte"],
  verification_email: ["vérification email", "verification email", "courriel de vérification", "confirmer mon email", "confirmer mon courriel"],
  verification_telephone: ["vérification téléphone", "verification telephone", "code sms", "code par sms"],
  mot_de_passe: ["mot de passe", "password"],
  profil: ["mon profil", "modifier mon profil", "informations de profil"],
  photo_profil: ["photo de profil", "photo profil"],
  photo_couverture: ["photo de couverture", "couverture"],
  publication: ["publier", "publication", "mon post", "mes posts"],
  photo_video: ["photo", "vidéo", "video", "image"],
  story: ["story", "stories", "statut"],
  messagerie: ["message", "messagerie", "conversation", "chat", "envoyer un message"],
  notifications: ["notification"],
  recherche: ["recherche", "rechercher", "chercher"],
  geolocalisation: ["géolocalisation", "geolocalisation", "localisation", "ma ville"],
  abonnement: ["abonnement", "suivre", "abonné"],
  like: ["like", "j'aime sur", "coeur"],
  match: ["match", "mise en relation"],
  communaute: ["communauté", "communaute"],
  immigration: ["immigration", "intégration", "integration", "nas", "ircc"],
  mode_sombre: ["mode sombre", "thème sombre", "theme sombre", "dark mode"],
  performance: ["lent", "lenteur", "charge trop", "freeze", "fige", "figé"],
  securite: ["sécurité", "securite", "signaler", "bloquer", "harcèlement", "harcelement"],
  compte_suspect: ["faux compte", "compte suspect", "arnaque", "scam"],
  paiement_premium: ["paiement", "premium", "abonnement payant", "carte bancaire", "facturation"],
};

const CRITICAL_MARKERS = [
  "impossible de me connecter", "je ne peux pas me connecter", "j'ai perdu mes données", "j'ai perdu mes photos",
  "faille", "sécurité", "securite", "toutes mes données", "compromis", "piraté", "pirate",
  "impossible d'utiliser l'application", "l'application ne fonctionne plus", "l'appli ne fonctionne plus",
];
const HIGH_MARKERS = [
  "messagerie", "impossible de publier", "je ne peux pas publier", "impossible de m'inscrire",
  "vérification email", "verification email", "crash", "plante", "ça plante", "ca plante", "bloqué", "bloque",
];
const MEDIUM_MARKERS = ["affichage", "s'affiche mal", "mobile", "écran", "ecran", "partiellement"];

export function detectDevice() {
  if (typeof navigator === "undefined") return "inconnu";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "inconnu";
}

export function detectBrowser() {
  if (typeof navigator === "undefined") return "inconnu";
  const ua = navigator.userAgent || "";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/CriOS/i.test(ua)) return "Chrome iOS";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  return "inconnu";
}

// Une ou plusieurs catégories peuvent matcher — un même message peut par ex.
// parler à la fois de "messagerie" et de "photo" (envoi de photo en chat).
export function detectCategories(text) {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return [];
  const matched = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
    .map(([cat]) => cat);
  return matched.length > 0 ? matched : ["autre"];
}

export function detectPriority(text) {
  const lower = (text || "").toLowerCase();
  if (CRITICAL_MARKERS.some((m) => lower.includes(m))) return "critique";
  if (HIGH_MARKERS.some((m) => lower.includes(m))) return "elevee";
  if (MEDIUM_MARKERS.some((m) => lower.includes(m))) return "moyenne";
  return lower.trim() ? "moyenne" : "faible";
}
