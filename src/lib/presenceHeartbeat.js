// Ordonnance le heartbeat de présence (effet "Présence en ligne" dans
// App.jsx) — extrait en fonction pure pour être testable avec des timers
// factices, sans avoir à monter App.jsx (dépend lourdement de
// Supabase/session/currentUser, comme lib/messageDeliveryState.js).
//
// Bug corrigé (audit présence, 25 sept.) : le setInterval appelait
// heartbeat() toutes les 30s SANS jamais vérifier document.visibilityState.
// Concrètement, mettre l'onglet en arrière-plan (changer d'onglet,
// minimiser la fenêtre) déclenchait bien immédiatement l'écriture
// is_online=false via le listener "visibilitychange" — mais le tick
// périodique suivant du minuteur (au plus 30s plus tard) réécrivait
// ensuite is_online=true SANS aucune condition, puisque heartbeat() ne
// vérifie jamais la visibilité lui-même. Résultat visible pour les autres
// utilisateurs : le point "En ligne" d'une personne ayant quitté l'onglet
// revenait à tort quelques secondes après être passé à "hors ligne", et ce
// en boucle toutes les 30s tant que l'onglet restait ouvert en arrière-plan
// — alors même que la personne n'était jamais revenue sur l'app. Le retour
// au premier plan reste couvert immédiatement par le listener
// "visibilitychange" (qui appelle heartbeat() directement) ; seul le tick
// périodique doit être filtré par la visibilité courante.
//
// Audit performance (6 oct. 2026) : l'intervalle par défaut passe de 30 s à 60 s.
// Chaque tick est un UPDATE sur "profiles" (ligne large, triggers BEFORE UPDATE,
// RLS) — avec 1 000 onglets visibles simultanés : ~33 écritures/s à 30 s contre
// ~17/s à 60 s, pour rien de visible : le point "En ligne" n'est affiché que si
// last_seen date de moins de ONLINE_STALE_MS = 10 min (lib/presence.js), et le
// retour de focus relance de toute façon un heartbeat immédiat.
export const HEARTBEAT_INTERVAL_MS = 60000;

export function startHeartbeatInterval(heartbeat, { intervalMs = HEARTBEAT_INTERVAL_MS, getVisibility = () => document.visibilityState } = {}) {
  const timer = setInterval(() => {
    if (getVisibility() === "visible") heartbeat();
  }, intervalMs);
  return () => clearInterval(timer);
}

// Présence complète (heartbeat + passage premier plan/arrière-plan), extraite
// d'App.jsx pour être testable.
//
// WEB (`native: false`) : comportement INCHANGÉ — heartbeat immédiat, tick
// périodique filtré par document.visibilityState, `visibilitychange` : visible ->
// heartbeat(), masqué -> goOffline().
//
// APP NATIVE (`native: true`) : l'évènement de référence est `appStateChange`
// de @capacitor/app (la WebView peut être gelée par le système en arrière-plan,
// `visibilitychange` n'y est pas fiable) :
//  - premier plan : heartbeat IMMÉDIAT puis minuteur de 60 s relancé ;
//  - arrière-plan : minuteur ARRÊTÉ (rien ne doit réécrire is_online=true
//    pendant que l'app n'est pas utilisée) et un dernier goOffline() best-effort.
// Si le plugin ne se charge pas, on garde `visibilitychange` comme sur le web.
// La règle produit « hors ligne 10 minutes après le dernier heartbeat » est
// appliquée À LA LECTURE (lib/presence.js : isUserOnline, ONLINE_STALE_MS) : un
// goOffline() perdu (WebView gelée avant la fin de la requête, téléphone éteint)
// n'a donc aucune conséquence durable.
export function startPresence({
  heartbeat,
  goOffline,
  native = false,
  onAppStateChange = async () => () => {},
  intervalMs = HEARTBEAT_INTERVAL_MS,
  doc = typeof document !== "undefined" ? document : null,
}) {
  const onVisibility = () => {
    if (doc.visibilityState === "visible") heartbeat();
    else goOffline();
  };

  heartbeat();

  if (!native) {
    const stopInterval = startHeartbeatInterval(heartbeat, { intervalMs, getVisibility: () => doc.visibilityState });
    doc.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopInterval();
      doc.removeEventListener("visibilitychange", onVisibility);
    };
  }

  // Natif : le minuteur est piloté explicitement (on l'arrête en arrière-plan) ;
  // aucune condition de visibilité n'est donc nécessaire.
  let stopInterval = startHeartbeatInterval(heartbeat, { intervalMs, getVisibility: () => "visible" });
  doc.addEventListener("visibilitychange", onVisibility);
  let cancelled = false;
  let removeAppState = null;
  let appStateActive = false;

  onAppStateChange(({ isActive }) => {
    if (cancelled) return;
    if (isActive) {
      heartbeat();
      stopInterval();
      stopInterval = startHeartbeatInterval(heartbeat, { intervalMs, getVisibility: () => "visible" });
    } else {
      stopInterval();
      stopInterval = () => {};
      goOffline();
    }
  })
    .then((remove) => {
      if (cancelled) {
        remove();
        return;
      }
      removeAppState = remove;
      appStateActive = true;
      // appStateChange prend le relais : on évite le double déclenchement
      // (heartbeat appelé deux fois au retour) en retirant visibilitychange.
      doc.removeEventListener("visibilitychange", onVisibility);
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    stopInterval();
    if (!appStateActive) doc.removeEventListener("visibilitychange", onVisibility);
    if (removeAppState) removeAppState();
  };
}
