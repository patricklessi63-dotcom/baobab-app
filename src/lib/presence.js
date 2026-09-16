// Dérive si un profil est RÉELLEMENT en ligne, à partir de is_online +
// last_seen (App.jsx tient ces deux colonnes via un heartbeat de 30s tant
// que l'onglet est visible, et les remet à false au moment où l'onglet
// passe en arrière-plan/se ferme normalement — voir l'effet "Présence en
// ligne" dans App.jsx).
//
// is_online seul ne suffit pas : une session qui se termine BRUTALEMENT
// (crash du navigateur, fermeture forcée de l'app, coupure réseau/veille du
// téléphone sans event "visibilitychange") ne déclenche jamais le nettoyage
// qui remettrait is_online à false. Sans ce filet, ce champ reste bloqué à
// true indéfiniment en base — un badge "En ligne" fantôme qui ne se
// corrigerait jamais tant que la personne ne rouvre pas vraiment l'app.
//
// ONLINE_STALE_MS (10 minutes, demande explicite du 15 sept.) borne donc la
// confiance qu'on accorde à is_online=true dans le temps : passé ce délai
// sans heartbeat récent (last_seen), on considère la personne hors ligne
// même si is_online n'a jamais été remis à false côté serveur. Distinct
// de la fenêtre "actif récemment" de DiscoverTab.jsx (15 min, sert à trier
// les profils, pas à afficher un badge "En ligne" binaire) — ne pas fusionner
// les deux, ce sont deux usages différents avec des tolérances différentes.
export const ONLINE_STALE_MS = 10 * 60 * 1000;

export function isUserOnline(profile) {
  if (!profile?.is_online || !profile?.last_seen) return false;
  return Date.now() - new Date(profile.last_seen).getTime() < ONLINE_STALE_MS;
}
