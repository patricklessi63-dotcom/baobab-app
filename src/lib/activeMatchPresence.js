// Résout la version À JOUR de la conversation actuellement ouverte
// (SocialShell.jsx) — extrait en fonction pure pour être testable sans
// monter tout SocialShell (dépend lourdement de Supabase/realtime, comme
// messageDeliveryState.js).
//
// Bug corrigé (audit messagerie temps réel, 25 sept.) : `activeMatch` est un
// instantané figé au moment où App.jsx appelle setActiveMatch() (voir
// openChat()) — il n'est ensuite JAMAIS resynchronisé quand les données de
// présence se rafraîchissent (heartbeat 30s, ou refreshPeersPresence sur
// retour de focus d'onglet dans App.jsx), alors que `matches` (dérivé de
// likerProfilesRaw via getMatches()) EST recalculé à jour à chaque rendu.
// Concrètement, tant qu'une conversation restait ouverte sans être
// refermée/rouverte :
// - le point "En ligne" de l'en-tête (ConversationPane.jsx, isUserOnline)
//   restait bloqué sur is_online/last_seen tels qu'ils étaient à l'instant
//   de l'ouverture ;
// - l'état "distribué" des accusés de réception (lib/messageDeliveryState.js,
//   qui dérive `otherOnline` de ce même profil) restait donc lui aussi figé ;
// - pire, avec un last_seen gelé, le filet ONLINE_STALE_MS (lib/presence.js)
//   finissait par considérer à tort le contact hors ligne après 10 minutes
//   même s'il était resté connecté en continu (Date.now() avance, last_seen
//   non) — une régression visible "distribué" → "envoyé" alors que le
//   contact n'a jamais quitté l'app.
//
// On retrouve donc ici, à chaque rendu, l'entrée à jour du même profil dans
// `matches` (par id) plutôt que de propager l'instantané figé.
export function resolveLiveMatch(activeMatch, matches) {
  if (!activeMatch) return null;
  return (matches || []).find((m) => m.id === activeMatch.id) || activeMatch;
}
