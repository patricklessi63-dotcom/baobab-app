// Export calendrier réel — un vrai fichier .ics téléchargeable (compatible
// Apple Calendar/Outlook/Google) et un lien "Ajouter à Google Calendar"
// utilisant l'URL publique "render" de Google (documentée, sans clé API).
// Aucun lien inventé, aucune intégration simulée.

function toIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(text) {
  return String(text).replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

function eventWindow(event) {
  const start = new Date(event.event_date);
  const end = new Date(start.getTime() + (event.duration_minutes ? event.duration_minutes : 60) * 60000);
  return { start, end };
}

export function buildIcsBlob(event) {
  const { start, end } = eventWindow(event);
  const location = [event.location, event.city].filter(Boolean).join(", ");
  // Bug identifié à l'audit du flux d'annulation : un événement annulé
  // (event.canceled_at rempli) produisait un fichier .ics identique à un
  // événement bien vivant — rien n'indiquait l'annulation à l'application de
  // calendrier de la personne qui le télécharge ou qui l'avait déjà importé
  // plus tôt. RFC 5545 prévoit justement STATUS:CANCELLED pour ce cas (§
  // 3.8.1.11) : on l'ajoute pour que les clients calendrier qui le
  // supportent (Apple Calendar, Outlook…) affichent/traitent l'événement
  // comme annulé plutôt que comme un rendez-vous normal.
  const canceled = Boolean(event.canceled_at);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Baobab//Evenements//FR",
    "BEGIN:VEVENT",
    `UID:${event.id}@baobab`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.title || "Événement Baobab")}`,
    canceled ? "STATUS:CANCELLED" : null,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : null,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}

export function downloadIcs(event) {
  const blob = buildIcsBlob(event);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(event.title || "evenement").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(event) {
  const { start, end } = eventWindow(event);
  const location = [event.location, event.city].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "",
    dates: `${toIcsUtc(start)}/${toIcsUtc(end)}`,
    details: event.description || "",
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
