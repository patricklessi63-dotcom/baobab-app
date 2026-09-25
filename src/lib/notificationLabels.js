// Libellés + catégories partagés entre SocialShell.jsx (menu déroulant) et
// FeedTab.jsx (panneau dans l'accueil) — une seule source pour éviter la
// divergence des deux affichages.
export const NOTIF_CATEGORIES = [
  ["all", "Tout"], ["messages", "Messages"], ["dating", "Rencontres"],
  ["communities", "Communautés"], ["events", "Événements"], ["follows", "Abonnés"],
];

export const NOTIFICATION_LABELS = {
  join_request_received: "Nouvelle demande d'adhésion",
  join_request_accepted: "Ta demande d'adhésion a été acceptée",
  invite_received: "Tu as reçu une invitation",
  report_received: "Nouveau signalement dans ta communauté",
  event_invite: "Tu as été invité(e) à un événement",
  event_participation_confirmed: "Ta participation est confirmée",
  event_updated: "Un événement auquel tu participes a changé",
  event_cancelled: "Un événement auquel tu participes a été annulé",
  event_reminder_24h: "Un événement commence dans 24h",
  event_reminder_1h: "Un événement commence dans 1h",
  event_report_received: "Nouveau signalement sur ton événement",
  event_waitlist_promoted: "Tu es passé(e) de la liste d'attente à participant(e)",
  new_follower: "Nouvel abonné",
  new_like: "T'a aimé(e)",
  new_match: "C'est un match !",
  new_message: "Nouveau message",
  post_liked: "A aimé ta publication",
  post_commented: "A commenté ta publication",
  // Écrites par le webhook Stripe (stripe-webhook/index.ts) mais jamais
  // affichées correctement avant (audit complémentaire post-palette) :
  // elles tombaient dans le fourre-tout "Communautés" sans libellé dédié.
  premium_activated: "Ton abonnement Premium est actif",
  premium_cancelled: "Ton abonnement Premium a été annulé",
  premium_payment_failed: "Échec du paiement de ton abonnement",
  premium_renewing_soon: "Ton abonnement Premium se renouvelle bientôt",
};

// Bug identifié à l'audit (angle "clic sur un rappel d'événement plusieurs
// jours après") : "event_reminder_24h"/"event_reminder_1h" affichent un
// délai FIXE ("commence dans 24h"/"dans 1h") calculé au moment où
// send_event_reminders() (cron SQL, hors périmètre ici) a écrit la
// notification — jamais réévalué à la lecture. Aucun horodatage
// n'accompagne par ailleurs ces lignes dans NotificationsDropdown.jsx ni
// FeedTab.jsx (contrairement à "Vu il y a X h/j" déjà affiché pour la
// dernière connexion, voir utils/format.js:formatLastSeen) : un utilisateur
// qui ouvre sa cloche plusieurs jours après continue de lire "commence dans
// 24h" pour un événement déjà terminé (ou annulé) depuis longtemps, sans
// aucun indice contraire dans le menu lui-même — seul le clic (qui ouvre
// bien l'événement à jour, voir EventDetailView isPast/canceled, déjà
// correct) révèle la vérité. On accole donc, uniquement pour ces deux types
// dont le texte encode une promesse de délai, le temps écoulé depuis
// l'envoi — les autres libellés ("Nouveau message", "Nouvel abonné"...)
// restent vrais quelle que soit la date de lecture et n'ont pas besoin de
// cet ajout.
export function reminderStaleness(type, createdAt) {
  if (type !== "event_reminder_24h" && type !== "event_reminder_1h") return "";
  if (!createdAt) return "";
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "";
  if (hours < 24) return `(envoyé il y a ${hours} h)`;
  const days = Math.floor(hours / 24);
  return `(envoyé il y a ${days} j)`;
}

// Regroupement client des notifications similaires (item audit — jusqu'ici
// chaque événement générait sa propre ligne, même 5 "like" identiques sur la
// même publication). Groupe par (catégorie, type) : conserve la ligne la
// plus récente comme représentante (icône, action au clic), remplace
// seulement le libellé affiché par un résumé "Nom, Nom +N — action". Ne
// touche à aucune donnée en base, purement un regroupement d'affichage.
export function groupNotificationRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.category}:${row.n.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const [only] = group;
      const staleness = reminderStaleness(only.n.type, only.n.created_at);
      // `only.label` est toujours défini en usage réel (calculé par
      // l'appelant avant regroupement) — garde défensive pour ne jamais
      // produire "undefined (envoyé...)" si jamais absent.
      result.push(staleness && only.label ? { ...only, label: `${only.label} ${staleness}` } : only);
      continue;
    }
    const [mostRecent] = group;
    const baseLabel = NOTIFICATION_LABELS[mostRecent.n.type] || "Nouvelle activité";
    const names = [...new Set(group.map((r) => r.n.actor?.name).filter(Boolean))];
    let label = names.length > 0
      ? `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""} — ${baseLabel}`
      : `${group.length} × ${baseLabel}`;
    const staleness = reminderStaleness(mostRecent.n.type, mostRecent.n.created_at);
    if (staleness) label = `${label} ${staleness}`;
    result.push({ ...mostRecent, label, groupCount: group.length, groupIds: group.map((r) => r.n.id) });
  }
  return result.sort((a, b) => new Date(b.n.created_at) - new Date(a.n.created_at));
}
