// Filtres du fil général « Actualités » : Tout, Abonnements, Populaires, Photos et vidéos.
//
// Gratuit, sans nouvelle table : tout se fait avec les requêtes existantes.
//  - Abonnements : publications des personnes que JE suis (table follows).
//  - Populaires : publications des 7 derniers jours classées par réactions et commentaires (calcul côté application
//    sur les 60 plus récentes ; pas de compteur serveur).
//  - Photos et vidéos : publications qui portent un média (table post_media ou ancien media_url).
// Les publications des communautés vivent dans l'onglet Communautés : elles n'entrent pas dans ce fil.

export const FEED_FILTERS = [
  ["all", "Tout"],
  ["following", "Abonnements"],
  ["popular", "Populaires"],
  ["media", "Photos et vidéos"],
];

export const POPULAR_WINDOW_DAYS = 7;
export const POPULAR_FETCH = 60;
export const POPULAR_SHOWN = 20;
const STORAGE_KEY = "bb.feedFilter";

export const isFeedFilter = (value) => FEED_FILTERS.some(([key]) => key === value);

// Choix mémorisé dans le navigateur (confort par personne) : jamais bloquant.
export function readStoredFilter() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isFeedFilter(v) ? v : "all";
  } catch (_) {
    return "all";
  }
}
export function storeFilter(value) {
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch (_) { /* navigation privée : sans effet */ }
}

// Score d'une publication : une réaction = 1, un commentaire = 2 (une conversation vaut plus qu'un clic).
export const popularityScore = (reactionTotal, commentCount) => (reactionTotal || 0) + 2 * (commentCount || 0);

// Classe les publications (déjà limitées à la fenêtre récente) du plus populaire au moins populaire ;
// à égalité, la plus récente d'abord. Les publications sans aucune interaction ne sont pas « populaires ».
export function rankPopular(posts, totalsByPost, commentsByPost, limit = POPULAR_SHOWN) {
  return [...posts]
    .map((p) => ({ p, score: popularityScore(totalsByPost?.[p.id], commentsByPost?.[p.id]) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => (b.score - a.score) || (new Date(b.p.created_at) - new Date(a.p.created_at)))
    .slice(0, limit)
    .map((x) => x.p);
}

export const popularSinceIso = (now = Date.now()) => new Date(now - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

// Ajoute à la requête « posts » les conditions du filtre. `ctx` : { followingIds, mediaPostIds }.
// Retourne { query, empty } : empty = true quand on sait déjà qu'il n'y a rien à lister (aucun abonnement…).
export function applyFeedFilter(query, filter, ctx = {}) {
  if (filter === "following") {
    const ids = ctx.followingIds || [];
    if (!ids.length) return { query, empty: true };
    return { query: query.in("author_id", ids), empty: false };
  }
  if (filter === "media") {
    const ids = (ctx.mediaPostIds || []).filter(Boolean);
    // « ou » : publications récentes qui ont une ligne post_media, ou l'ancien champ media_url
    const cond = ids.length ? `id.in.(${ids.join(",")}),media_url.not.is.null` : "media_url.not.is.null";
    return { query: query.or(cond), empty: false };
  }
  if (filter === "popular") {
    return { query: query.gte("created_at", popularSinceIso()), empty: false };
  }
  return { query, empty: false };
}

export const EMPTY_MESSAGES = {
  following: { title: "Aucune publication de tes abonnements.", subtitle: "Abonne-toi à des membres pour voir leurs publications ici." },
  popular: { title: "Rien de populaire cette semaine.", subtitle: "Réagis et commente : les publications qui font parler apparaissent ici." },
  media: { title: "Aucune photo ni vidéo pour l'instant.", subtitle: "Les publications avec un média s'affichent ici." },
};
