// Configuration centralisée des communautés — jamais codée en dur dans
// plusieurs composants (item 6). Un seul endroit à modifier pour ajouter/
// renommer une catégorie ou un niveau de visibilité.

export const COMMUNITY_CATEGORIES = [
  { value: "etudes", label: "Études", icon: "🎓" },
  { value: "profession", label: "Profession", icon: "💼" },
  { value: "sport", label: "Sport", icon: "🏃" },
  { value: "musique", label: "Musique", icon: "🎵" },
  { value: "voyage", label: "Voyage", icon: "✈️" },
  { value: "cuisine", label: "Cuisine", icon: "🍽️" },
  { value: "art", label: "Art", icon: "🎨" },
  { value: "technologie", label: "Technologie", icon: "💻" },
  { value: "entrepreneuriat", label: "Entrepreneuriat", icon: "🚀" },
  { value: "bien_etre", label: "Bien-être", icon: "🌱" },
  { value: "jeux", label: "Jeux", icon: "🎮" },
  { value: "lecture", label: "Lecture", icon: "📚" },
  { value: "vie_au_canada", label: "Vie au Canada", icon: "🇨🇦" },
  { value: "culture", label: "Culture", icon: "🌍" },
  { value: "sorties", label: "Sorties", icon: "🎉" },
];

export const COMMUNITY_VISIBILITY = [
  { value: "public", label: "Publique", description: "Tout le monde peut voir et rejoindre directement." },
  { value: "private", label: "Privée", description: "Visible par tous, mais rejoindre nécessite une demande approuvée." },
  { value: "invite_only", label: "Sur invitation", description: "Seules les personnes invitées peuvent rejoindre." },
];

export const COMMUNITY_ROLES = [
  { value: "owner", label: "Propriétaire" },
  { value: "admin", label: "Administrateur" },
  { value: "moderator", label: "Modérateur" },
  { value: "member", label: "Membre" },
];

// Catégories de signalement de contenu de communauté — même liste que
// ReportModal moins "faux_profil" (sans objet pour un post/commentaire).
export const COMMUNITY_REPORT_CATEGORIES = [
  { value: "harcelement", label: "Harcèlement" },
  { value: "spam", label: "Spam" },
  { value: "contenu_inapproprie", label: "Contenu inapproprié" },
  { value: "arnaque", label: "Arnaque" },
  { value: "usurpation", label: "Usurpation d'identité" },
  { value: "autre", label: "Autre" },
];

export function categoryLabelForReport(value) {
  return COMMUNITY_REPORT_CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function categoryLabel(value) {
  return COMMUNITY_CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function categoryIcon(value) {
  return COMMUNITY_CATEGORIES.find((c) => c.value === value)?.icon || "🌍";
}

export function roleLabel(value) {
  return COMMUNITY_ROLES.find((r) => r.value === value)?.label || value;
}
