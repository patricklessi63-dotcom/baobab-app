export const C = {
  indigo: "#1E2A4F",
  indigoDeep: "#141D38",
  clay: "#C1613D",
  ochre: "#D9A441",
  sand: "#F2E9DC",
  ink: "#2B2420",
};

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
