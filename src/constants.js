// Source unique de vérité pour les couleurs de l'app — anciennement
// dispersée en 3 palettes incompatibles (constants.js, auth/authTheme.js,
// social/theme.js). Les deux autres fichiers sont désormais de simples
// ré-exports de ce module (voir leur en-tête). Un jeton de couleur n'est
// jamais dupliqué en dur ailleurs : voir chaque composant pour l'import.
export const C = {
  // --- Identité Baobab 3.0 (Design System) — vert profond en primaire,
  // turquoise en secondaire, accents chauds (corail/or) inchangés pour le
  // contraste. Remplace l'ancienne identité marine (Phase ≤12). Les noms de
  // jetons ("indigo", "navy", "dusk"...) sont conservés pour ne pas refaire
  // les ~90 imports qui les référencent — seules leurs valeurs changent. ---

  // --- Chrome applicatif / onboarding / édition de profil ---
  indigo: "#14432A",
  indigoDeep: "#0D2E1C",
  clay: "#C1613D",
  ochre: "#D9A441",
  sand: "#F2E9DC",
  ink: "#2B2420",

  // --- Écrans pré-connexion (auth, landing, pages légales) ---
  dusk: "#0C2318",
  dusk3: "#1E4632",
  bark: "#8A6A52",
  acacia: "#8FAE86",
  sandDim: "rgba(242,233,220,0.72)",

  // --- Coquille sociale post-connexion (fil, découverte, messages...) ---
  // "primary" est le jeton de TEXTE/TITRE principal — réactif au thème via
  // variable CSS (voir index.html) : vert profond en clair, presque blanc en
  // sombre. Les ~14 endroits qui utilisaient primary comme fond de bouton
  // plein (volontairement toujours vert profond, jamais inversé) utilisent
  // désormais "navy" ci-dessous à la place.
  primary: "var(--bb-text)",
  // "navy" : copie FIXE du vert profond primaire, jamais réactive — pour les
  // fonds de bouton pleins et dégradés décoratifs qui doivent rester vert
  // foncé dans les deux thèmes (voir navyRgb plus bas). Nom historique
  // conservé (ex-marine) pour éviter de retoucher ~15 fichiers.
  navy: "#14432A",
  // "green" : vert secondaire (turquoise) — accent lumineux, distinct du vert
  // profond primaire ci-dessus.
  green: "#2DBF9E",
  coral: "#E56B5D",
  gold: "#F2B84B",

  // --- Jetons de surface, réactifs au thème (clair/sombre, voir index.html) ---
  bg: "var(--bb-bg)",
  surface: "var(--bb-surface)",
  muted: "var(--bb-muted)",
  // --- Refonte or/noir (août 2026, maquettes fournies) — surface secondaire
  // (en-têtes/nav/inputs, un cran plus sombre que "surface" en mode sombre),
  // dégradé or à deux arrêts (accent dominant des CTA), texte très estompé
  // (métadonnées). Réactifs au thème comme le reste de ce bloc.
  surface2: "var(--bb-surface-2)",
  gold1: "var(--bb-gold-1)",
  gold2: "var(--bb-gold-2)",
  textFaint: "var(--bb-text-faint)",
  // "body" : nuance de texte de corps distincte de "primary" (utilisée pour
  // titres/icônes), déjà répétée en dur ~15 fois dans social/ — convention
  // de fait promue en jeton nommé, valeur inchangée.
  body: "var(--bb-body-text)",

  // --- Promues depuis des littéraux orphelins ailleurs dans le code,
  // valeurs inchangées — juste nommées pour éviter la dérive future ---
  dangerBg: "#FCE8E0",
  goldTint: "#FFF9F0",
  goldTintDeep: "#FFF3E8",
  goldText: "#A5761F",
  online: "#27C56D",
  offline: "#B9BEC9",
  // Badge "vérifié" en or (refonte visuelle) au lieu du bleu d'origine —
  // pointe vers le jeton réactif au thème : or vif en mode sombre (maquettes),
  // ocre existant en mode clair (déjà cohérent avec sa palette, pas de bleu
  // à y faire coexister sans référence).
  verified: "var(--bb-gold-1)",
};

// Triplet RGB de "primary" (bordures/scrims réactifs au thème via
// rgba(${primaryRgb},X)) — variable CSS, plus dérivable d'un hex depuis que
// "primary" pointe vers var(--bb-text). Triplet FIXE équivalent pour les
// dégradés/scrims décoratifs qui doivent rester marine dans les deux thèmes
// (voir C.navy).
export const primaryRgb = "var(--bb-text-rgb)";
export const navyRgb = "20,67,42";

export const EDUCATION_LEVELS = ["Secondaire", "Collégial / DEC", "Baccalauréat", "Maîtrise", "Doctorat", "Formation professionnelle"];
export const HAS_CHILDREN_OPTIONS = ["Oui", "Non"];
export const MAX_PHOTOS = 6;

// ---------- Phase 12a — Bienvenue + objectif d'usage ----------

// "Qu'est-ce que tu recherches sur Baobab ?" — étape 1 de l'onboarding,
// multi-choix. Volontairement séparé de LOOKING_FOR_OPTIONS ci-dessous
// (intentions romantiques, utilisées par le moteur de matching) : celui-ci
// sert uniquement à personnaliser l'écran d'accueil (quel onglet du fil
// ouvrir en premier), jamais le score de compatibilité.
export const USAGE_GOAL_OPTIONS = ["❤️ Rencontre", "🤝 Amitié", "🌍 Communauté", "🎉 Événements", "💼 Networking"];

// ---------- Phase 3 — Profil + Onboarding ----------

// "Ce que tu recherches" — multi-choix (remplace l'ancien champ à choix unique).
export const LOOKING_FOR_OPTIONS = [
  "❤️ Amour",
  "💍 Relation sérieuse",
  "🤝 Amitié",
  "☕ Sorties",
  "🌎 Réseau social",
  "🇨🇦 Intégration",
  "🎉 Activités",
];

// Sous-question affichée seulement si Amour ou Relation sérieuse est coché.
export const RELATIONSHIP_VALUES_OPTIONS = [
  "❤️ Relation sérieuse",
  "💍 Projet de mariage",
  "🌱 Construire une relation progressivement",
  "💬 Faire connaissance",
];

export const IMMIGRATION_STATUS_OPTIONS = [
  "Étudiant(e)",
  "Travailleur(se)",
  "Résident(e) permanent(e)",
  "Citoyen(ne)",
  "Nouveau résident(e)",
  "Autre",
];

export const WANTS_CHILDREN_OPTIONS = ["Oui", "Non", "Peut-être", "Je préfère ne pas répondre"];
export const FAMILY_IMPORTANCE_OPTIONS = ["Faible", "Moyenne", "Importante", "Très importante"];
export const CAREER_GOAL_OPTIONS = ["Carrière", "Entrepreneuriat", "Études", "Stabilité", "Autre"];
export const GEOGRAPHIC_OPENNESS_OPTIONS = [
  "Je souhaite rester dans ma ville",
  "Je suis ouvert(e) à déménager",
  "Je suis ouvert(e) à une autre province",
  "Je suis ouvert(e) à l'étranger",
];

export const PERSONALITY_EVENING_OPTIONS = ["Une soirée tranquille 🏠", "Sortir et rencontrer du monde 🎉"];
export const PERSONALITY_TRAVEL_OPTIONS = ["Je planifie tout 🗺️", "Je préfère improviser 🎲"];
export const RELATIONSHIP_NEEDS_OPTIONS = ["Communication", "Confiance", "Humour", "Respect", "Valeurs communes"];

export const INTERESTS_OPTIONS = [
  "🏃 Sport", "✈️ Voyage", "🎵 Musique", "🍳 Cuisine", "🎬 Cinéma", "📚 Lecture",
  "💻 Technologie", "💡 Entrepreneuriat", "👗 Mode", "🌿 Nature", "💃 Danse",
  "🎮 Jeux vidéo", "🙏 Spiritualité", "🎭 Culture", "🎨 Art", "📸 Photographie",
  "🤝 Bénévolat", "🌱 Jardinage", "✍️ Écriture", "🎭 Théâtre", "🧘 Yoga & méditation",
  "🚗 Automobile", "🍷 Gastronomie", "🐾 Animaux", "🔬 Sciences", "🏛️ Histoire",
];

export const LANGUAGES_OPTIONS = [
  "Français", "Anglais", "Espagnol", "Portugais", "Arabe", "Lingala", "Swahili",
  "Wolof", "Créole haïtien", "Bambara", "Peul (Fulfulde)", "Mandarin", "Vietnamien",
  "Tagalog", "Hindi", "Italien", "Allemand", "Russe",
];
export const LANGUAGE_LEVELS = ["Débutant", "Intermédiaire", "Avancé", "Courant"];

export const ONBOARDING_STEP_COUNT = 10;

// ---------- Phase 4 — Baobab Match ----------
export const MATCH_DISTANCE_OPTIONS = ["Ma ville uniquement", "Ma ville ou mon pays", "Peu importe"];
