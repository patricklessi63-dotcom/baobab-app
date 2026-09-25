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
export function startHeartbeatInterval(heartbeat, { intervalMs = 30000, getVisibility = () => document.visibilityState } = {}) {
  const timer = setInterval(() => {
    if (getVisibility() === "visible") heartbeat();
  }, intervalMs);
  return () => clearInterval(timer);
}
