// Réactions des publications du fil général (Actualités). Une seule réaction active par personne et par
// publication (colonne emoji de post_likes, voir supabase-post-reactions.sql). Tant que ce SQL n'est pas
// exécuté, la base ne connaît que le « like » : tout est alors un cœur, et les autres réactions sont
// refusées avec un message clair (isMissingEmojiColumn).

export const HEART = "❤️";
export const POST_REACTIONS = [HEART, "😂", "😍", "👏", "🤝", "😮"];
export const POST_REACTION_LABEL = { "❤️": "J'adore", "😂": "Drôle", "😍": "Magnifique", "👏": "Bravo", "🤝": "Solidarité", "😮": "Surprenant" };

// ❤ et ❤️ sont le même cœur : on compare sans le sélecteur de variante (U+FE0F).
const base = (e) => String(e || "").replace(/\uFE0F/g, "");
export const normalizeReaction = (e) => POST_REACTIONS.find((r) => base(r) === base(e)) || null;

// rows : [{ post_id, profile_id, emoji? }] -> { counts: { [postId]: { [emoji]: n } }, mine: { [postId]: emoji } }
export function tallyReactions(rows, myId) {
  const counts = {}; const mine = {};
  for (const r of rows || []) {
    const emoji = normalizeReaction(r.emoji) || HEART; // ligne sans emoji (avant SQL-28) = cœur
    const byPost = (counts[r.post_id] ||= {});
    byPost[emoji] = (byPost[emoji] || 0) + 1;
    if (r.profile_id === myId) mine[r.post_id] = emoji;
  }
  return { counts, mine };
}

export const totalOf = (counts) => Object.values(counts || {}).reduce((a, b) => a + b, 0);

// Les emojis à afficher à côté du compteur : les plus utilisés d'abord (3 au plus).
export function topReactions(counts, limit = 3) {
  return Object.entries(counts || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([e]) => e);
}

// Que faire quand on touche « chosen » alors qu'on avait « previous » ?
//  - même réaction : on la retire ; - aucune avant : on l'ajoute ; - autre avant : on la remplace.
export function planReaction(previous, chosen) {
  const prev = normalizeReaction(previous);
  const next = normalizeReaction(chosen);
  if (!next) return { op: "none", next: prev };
  if (!prev) return { op: "insert", next };
  if (prev === next) return { op: "delete", next: null };
  return { op: "update", next };
}

// Compteurs après le passage de « previous » à « next » (jamais négatifs).
export function applyReactionChange(counts, previous, next) {
  const out = { ...(counts || {}) };
  if (previous) out[previous] = Math.max(0, (out[previous] || 0) - 1);
  if (next) out[next] = (out[next] || 0) + 1;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

// PostgREST répond 400 / PGRST204 / 42703 quand la colonne emoji n'existe pas encore (SQL-28 non exécuté).
export const isMissingEmojiColumn = (error) =>
  Boolean(error) && (error.code === "PGRST204" || error.code === "42703" || /emoji/i.test(String(error.message || "")) && /column|schema cache/i.test(String(error.message || "")));
