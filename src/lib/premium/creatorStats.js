import { supabase } from "../../supabaseClient";

// « Mes statistiques » (SQL-40, avantage Premium). Le client ne fait qu'appeler la fonction
// my_creator_stats : le droit est vérifié côté serveur, et la fonction ne renvoie que des NOMBRES
// sur le compte connecté (jamais des personnes). Aucune visite n'est enregistrée nulle part.

export const STATS_PERIODS = [7, 30, 90];
export const DEFAULT_STATS_PERIOD = 30;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Réponse du serveur → forme sûre à afficher (champs manquants = 0 / liste vide).
export function normalizeStats(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    periodDays: num(s.period_days) || DEFAULT_STATS_PERIOD,
    posts: { total: num(s.posts_total), period: num(s.posts_period) },
    likes: { total: num(s.likes_total), period: num(s.likes_period) },
    comments: { total: num(s.comments_total), period: num(s.comments_period) },
    followers: { total: num(s.followers_total), period: num(s.followers_period) },
    topPosts: (Array.isArray(s.top_posts) ? s.top_posts : []).map((p) => ({
      id: p.id,
      excerpt: String(p.excerpt ?? ""),
      createdAt: p.created_at ?? null,
      likes: num(p.likes),
      comments: num(p.comments),
    })),
    weekly: (Array.isArray(s.weekly) ? s.weekly : []).map((w) => ({
      week: String(w.week ?? ""),
      posts: num(w.posts),
      likes: num(w.likes),
      comments: num(w.comments),
    })),
  };
}

// Vrai si rien n'a encore été reçu : l'écran le dit au lieu d'afficher une page de zéros muette.
export function isStatsEmpty(stats) {
  return stats.likes.total === 0 && stats.comments.total === 0 && stats.followers.total === 0 && stats.posts.total === 0;
}

// « 2024-11-03 » → « 3 nov. » (date locale construite à la main : pas de décalage de fuseau).
export function weekLabel(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

// Message lisible pour une erreur de la base. `null` : l'appelant affiche son message générique.
export function statsErrorMessage(error) {
  const text = `${error?.message || ""} ${error?.code || ""}`;
  if (error?.code === "42501" || /Reserve aux abonnes/i.test(text)) return "Les statistiques sont réservées aux abonnés Premium.";
  if (error?.code === "42883" || error?.code === "PGRST202" || /could not find the function|does not exist/i.test(text)) {
    return "Les statistiques ne sont pas encore disponibles.";
  }
  return null;
}

export async function loadCreatorStats(days = DEFAULT_STATS_PERIOD) {
  const { data, error } = await supabase.rpc("my_creator_stats", { p_days: days });
  if (error) throw error;
  return normalizeStats(data);
}
