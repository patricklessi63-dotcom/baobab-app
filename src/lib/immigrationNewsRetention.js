// Fraîcheur du fil « Actualités » (IRCC / ASFC, ImmigrationNewsView).
//
// Côté serveur (SQL-46, supabase-immigration-news-retention.sql) : chaque
// dimanche soir, les actualités publiées il y a plus de NEWS_RETENTION_DAYS
// jours sont effacées (sauf celles qu'un membre a mises en favori), et une
// entrée plus ancienne que ce délai n'est plus réinsérée par la récupération
// automatique (toutes les 6 h).
//
// Une actualité vit donc au plus jusqu'au deuxième dimanche après sa
// publication, soit moins de NEWS_MAX_AGE_DAYS jours. Le client masque tout ce
// qui dépasse cette borne : même si la purge n'a pas tourné (SQL non exécuté,
// cron en échec), le fil n'affiche jamais une actualité de plus de deux
// semaines. Les favoris restent consultables dans le filtre « Favoris ».
export const NEWS_RETENTION_DAYS = 7;
export const NEWS_MAX_AGE_DAYS = 14;

// Au retour dans l'app après au moins 30 min d'absence, le fil se recharge
// sans « Chargement... » : une app laissée ouverte d'un jour à l'autre montre
// les actualités du jour.
export const NEWS_RESUME_RELOAD_MS = 30 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isNewsRecent(item, now) {
  const t = Date.parse(item?.published_at);
  // Date absente ou illisible : on garde l'actualité plutôt que de la cacher
  // sans raison (la base impose published_at non nul).
  if (Number.isNaN(t)) return true;
  return now - t <= NEWS_MAX_AGE_DAYS * DAY_MS;
}
