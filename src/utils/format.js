export function matchKey(a, b) {
  return [a, b].sort().join("__");
}

// Tronque une chaîne à `maxLength` unités UTF-16 sans jamais couper une paire
// surrogate en deux — cas concret : bio, message ou commentaire proche de sa
// limite (300/500/1000/4000 selon l'endroit) auquel on ajoute un emoji hors
// du plan multilingue de base (😀🎉🚀... la plupart des emoji modernes,
// codés sur 2 unités UTF-16) via le sélecteur d'emoji, une suggestion IA ou
// un collage. Un `.slice(0, N)` nu peut couper exactement entre les deux
// moitiés de cet emoji si la longueur totale dépasse la limite d'une seule
// unité, laissant un surrogate orphelin dans le texte — rendu ensuite comme
// un caractère invalide (tofu) à l'écran, et envoyé tel quel si le message
// est publié. `str.length` (utilisé par tous les compteurs "x/N" de l'app)
// compte déjà en unités UTF-16, donc ce plafond reste cohérent avec eux.
export function truncateUnicodeSafe(str, maxLength) {
  if (!str || str.length <= maxLength) return str || "";
  let end = maxLength;
  const code = str.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1; // high surrogate laissé seul par la coupe
  return str.slice(0, end);
}

// Réglage exclusif fondateur (PrivacyFieldsModal, currentUser.is_founder
// uniquement) — non disponible dans les réglages des autres utilisateurs,
// donc profile.show_birth_year vaut toujours true/undefined pour eux :
// aucun changement de comportement pour le reste de l'app.
export function visibleAge(profile) {
  return profile?.show_birth_year === false ? null : profile?.age;
}

export function formatLastSeen(iso) {
  if (!iso) return "Statut inconnu";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Vu à l'instant";
  if (mins < 60) return `Vu il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Vu il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Vu il y a ${days} j`;
}

export function formatMessageTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

// Date longue en français ("3 septembre 2026") — le format utilisé partout
// ailleurs dans l'app pour une date importante montrée à l'utilisateur
// (suppression de compte, renouvellement Premium, article d'actualité).
// Avant ce correctif, la date de fin de suspension/bannissement (écran vu
// par l'utilisateur suspendu ET liste admin) utilisait toLocaleDateString
// sans options, ce qui pour la locale "fr-CA" produit un format numérique
// type "2026-09-03" — seul endroit de l'app à afficher une date importante
// ainsi, sans raison fonctionnelle.
export function formatLongDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

export function formatDayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Aujourd'hui";
  if (sameDay(d, yesterday)) return "Hier";
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "long" });
}

export function messagePreviewLabel(m) {
  // Un message supprimé "pour tout le monde" (deleted_at, voir
  // ConversationPane.jsx qui affiche déjà "Message supprimé" dans le fil)
  // affichait encore son contenu original ici, dans l'aperçu de la liste
  // des conversations (MessagesTab.jsx) — le seul autre endroit de l'app
  // qui rendait ce texte sans jamais regarder deleted_at.
  if (m?.deleted_at) return "Message supprimé";
  switch (m?.kind) {
    case "image": return "📷 Photo";
    case "video": return "🎥 Vidéo";
    case "audio": return "🎤 Message vocal";
    case "file": return `📎 ${m.media_meta?.original_name || "Fichier"}`;
    case "sticker": return "😊 Autocollant";
    case "event": return `🎉 ${m.media_meta?.title || "Événement"}`;
    default: return m?.text || "";
  }
}

export function formatEventWhen(iso, timezone) {
  if (!iso) return "";
  const d = new Date(iso);
  const tzOpt = timezone ? { timeZone: timezone } : undefined;
  const weekday = d.toLocaleDateString("fr-CA", { weekday: "long", ...tzOpt });
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  // getMinutes() lit l'heure locale du navigateur — insuffisant si "timezone"
  // diffère (ex. décalage :30 à Terre-Neuve) : on lit la minute réellement
  // affichée dans le fuseau cible pour décider de l'afficher ou non.
  const minutePart = new Intl.DateTimeFormat("fr-CA", { minute: "numeric", ...tzOpt }).format(d);
  const time = d.toLocaleTimeString("fr-CA", { hour: "numeric", minute: minutePart !== "0" ? "2-digit" : undefined, ...tzOpt });
  return `${label} ${time}`;
}
