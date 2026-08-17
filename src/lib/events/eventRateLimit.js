// Garde-fous d'UX côté client (même forme que messageRateLimit.js) — PAS
// une barrière de sécurité, contournable via un appel API direct. La seule
// limite réellement appliquée côté base pour les événements est le
// trigger anti-spam sur event_invitations (supabase-events-v2.sql,
// 30 invitations/24h) — visée explicitement par la consigne anti-spam.
export const EVENT_CREATE_RATE_LIMIT = { maxActions: 5, windowMs: 3600000 }; // 5 créations/heure
export const EVENT_REPORT_RATE_LIMIT = { maxActions: 10, windowMs: 3600000 }; // 10 signalements/heure

export function checkRateLimit(recentTimestamps, limit, now = Date.now()) {
  const cutoff = now - limit.windowMs;
  const remainingTimestamps = recentTimestamps.filter((t) => t > cutoff);
  return {
    allowed: remainingTimestamps.length < limit.maxActions,
    remainingTimestamps,
  };
}
