// ============================================================================
// « Supprimer pour tout le monde » : règle d'AFFICHAGE de l'option.
//
// Le serveur reste l'autorité (déclencheur enforce_message_update_rules, SQL-27) : il vérifie
// l'auteur et le délai avec SA propre horloge. Ce module ne sert qu'à ne proposer l'option que
// pendant le délai, pour éviter un clic voué à l'échec. Une option affichée à tort (horloge du
// téléphone en retard) est refusée par le serveur avec un message clair ; une option masquée trop tôt
// (horloge en avance) reste rattrapable par la suppression « pour moi ».
// ============================================================================

export const DEFAULT_DELETE_WINDOW_MINUTES = 15; // même défaut que app_config.message_delete_window_minutes
const MIN_WINDOW = 1;
const MAX_WINDOW = 10080; // 7 jours, même borne que la contrainte SQL

let windowMinutes = DEFAULT_DELETE_WINDOW_MINUTES;

export function getMessageDeleteWindowMinutes() {
  return windowMinutes;
}

// Valeur lue côté serveur ; toute valeur hors bornes (ou absente) revient au défaut.
export function setMessageDeleteWindowMinutes(value) {
  const n = Number(value);
  windowMinutes = Number.isFinite(n) && n >= MIN_WINDOW && n <= MAX_WINDOW ? Math.floor(n) : DEFAULT_DELETE_WINDOW_MINUTES;
  return windowMinutes;
}

// Ne lève jamais : tant que la colonne n'existe pas en base (SQL-27 pas encore exécuté), la requête
// échoue et le défaut de 15 minutes reste appliqué à l'interface.
export async function loadMessageDeleteWindow(client) {
  try {
    const { data, error } = await client.from("app_config").select("message_delete_window_minutes").limit(1).maybeSingle();
    if (error || !data) return windowMinutes;
    return setMessageDeleteWindowMinutes(data.message_delete_window_minutes);
  } catch {
    return windowMinutes;
  }
}

/**
 * L'option « Supprimer pour tout le monde » doit-elle être proposée pour ce message ?
 * @param {object} message
 * @param {{ isMine: boolean, windowMinutes?: number, nowMs?: number }} ctx
 */
export function canDeleteForEveryone(message, { isMine, windowMinutes: window = windowMinutes, nowMs = Date.now() } = {}) {
  if (!message || !isMine) return false;
  if (message.deleted_at) return false;
  // Message pas encore (ou pas) enregistré côté serveur : rien à supprimer pour les autres.
  if (message._status === "sending" || message._status === "uploading" || message._status === "failed") return false;
  const sentAt = Date.parse(message.created_at);
  if (!Number.isFinite(sentAt)) return false;
  return nowMs - sentAt <= window * 60 * 1000;
}
