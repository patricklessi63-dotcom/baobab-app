// Sérialise les écritures réseau pour une même clé (ex. handleToggleField,
// App.jsx) — bug concret trouvé à l'audit de PrivacyFieldsModal.jsx : chaque
// bascule d'un même réglage (ex. show_city) envoyait un appel réseau
// indépendant, sans aucune garde. Deux clics rapprochés sur le même
// interrupteur (désactiver puis réactiver, ou l'inverse) déclenchaient donc
// deux UPDATE concurrents sur la même ligne, et rien ne garantissait que
// leur ORDRE D'EXÉCUTION côté serveur corresponde à l'ordre réel des clics :
// avec une latence réseau variable, la requête du PREMIER clic pouvait très
// bien atteindre la base APRÈS celle du second. L'UI (mise à jour de façon
// optimiste, de façon synchrone, dans l'ordre des clics) affichait alors le
// bon dernier choix, mais la valeur réellement enregistrée en base restait
// celle du premier clic — une incohérence silencieuse entre ce que
// l'utilisateur voyait et ce qui était sauvegardé, invisible jusqu'au
// prochain rechargement de la page.
//
// enqueue(key, task) n'exécute `task` qu'une fois la tâche précédente
// enregistrée pour la même `key` terminée (succès ou échec), ce qui garantit
// que les écritures pour un même champ partent dans l'ordre des clics et
// donc que la DERNIÈRE lancée est aussi la DERNIÈRE à s'exécuter côté
// serveur. Des clés différentes restent totalement indépendantes (aucun
// ralentissement croisé entre deux réglages distincts).
export function createFieldWriteQueue() {
  const tails = new Map();

  function enqueue(key, task) {
    const previous = tails.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    // La queue stockée pour cette clé ne doit jamais se terminer "rejetée",
    // sinon un échec couperait la chaîne pour tous les appels suivants sur
    // la même clé (le .catch(() => {}) ci-dessus gère déjà l'attente, celui-
    // ci gère ce qui est mémorisé comme "tâche précédente").
    tails.set(key, run.catch(() => {}));
    return run;
  }

  return { enqueue };
}
