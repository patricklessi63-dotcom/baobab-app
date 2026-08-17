// Configuration centralisée des événements — jamais codée en dur dans
// plusieurs composants (même motif que communityConfig.js, Phase 6).

export const EVENT_CATEGORIES = [
  { value: "rencontres", label: "Rencontres", icon: "❤️" },
  { value: "amities", label: "Amitiés", icon: "🤝" },
  { value: "sport", label: "Sport", icon: "🏃" },
  { value: "musique", label: "Musique", icon: "🎵" },
  { value: "repas", label: "Repas", icon: "🍽️" },
  { value: "etudes", label: "Études", icon: "🎓" },
  { value: "networking", label: "Networking", icon: "💼" },
  { value: "culture", label: "Culture", icon: "🎨" },
  { value: "voyages", label: "Voyages", icon: "✈️" },
  { value: "jeux", label: "Jeux", icon: "🎮" },
  { value: "communautes", label: "Communautés", icon: "🌍" },
  { value: "sorties", label: "Sorties", icon: "🎉" },
];

export const EVENT_VISIBILITY = [
  { value: "public", label: "Public", description: "Tout le monde peut découvrir et rejoindre l'événement." },
  { value: "community", label: "Communauté", description: "Seuls les membres de la communauté associée peuvent le découvrir et le rejoindre." },
  { value: "private", label: "Privé", description: "Accessible uniquement aux personnes invitées." },
];

export const EVENT_STAFF_ROLES = [
  { value: "organizer", label: "Organisateur" },
  { value: "co_organizer", label: "Co-organisateur" },
  { value: "moderator", label: "Modérateur" },
];

// Même liste que la contrainte SQL event_reports.category (supabase-events-v2.sql).
export const EVENT_REPORT_CATEGORIES = [
  { value: "spam", label: "Spam" },
  { value: "arnaque", label: "Arnaque" },
  { value: "faux_evenement", label: "Faux événement" },
  { value: "harcelement", label: "Harcèlement" },
  { value: "contenu_inapproprie", label: "Contenu inapproprié" },
  { value: "autre", label: "Autre" },
];

export const EVENT_ATTENDANCE_STATUS = [
  { value: "going", label: "Participera" },
  { value: "interested", label: "Intéressé(e)" },
  { value: "not_going", label: "Ne participe pas" },
  { value: "waitlisted", label: "Sur liste d'attente" },
];

export function categoryLabel(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function categoryIcon(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value)?.icon || "🎉";
}

export function staffRoleLabel(value) {
  return EVENT_STAFF_ROLES.find((r) => r.value === value)?.label || value;
}

export function reportCategoryLabel(value) {
  return EVENT_REPORT_CATEGORIES.find((c) => c.value === value)?.label || value;
}
