// Intention transmise à l'écran Premium par le bouton qui y mène : « Découvrir
// Premium » (aperçu, comparaison en tête) ou « Passer à Premium » (descend
// directement aux formules). Un simple relais en mémoire, lu une seule fois à
// l'ouverture de la page : pas de paramètre d'URL, pas de stockage, et aucune
// donnée personnelle. Une valeur inconnue est ignorée.
let pending = null;

export function setPremiumIntent(intent) {
  pending = intent === "plans" ? "plans" : null;
}

export function consumePremiumIntent() {
  const value = pending;
  pending = null;
  return value;
}
