// Intention transmise à l'écran Premium par le bouton qui y mène : « Découvrir
// Premium » (aperçu, comparaison en tête) ou « Passer à Premium » (descend
// directement aux formules). Un simple relais en mémoire, lu une seule fois à
// l'ouverture de la page : pas de paramètre d'URL, pas de stockage, et aucune
// donnée personnelle. Une valeur inconnue est ignorée.
let pending = null;

export function setPremiumIntent(intent) {
  pending = intent === "plans" ? "plans" : null;
}

// Navigation vers l'écran Premium depuis n'importe quel composant, sans faire passer une prop à
// travers toute l'arborescence : la coque de l'app (SocialShell) enregistre sa fonction au montage,
// un composant profond appelle openPremium("discover" | "plans"). Sans fonction enregistrée
// (tests, écran sans coque), l'appel ne fait rien et renvoie false.
let premiumNavigator = null;

export function setPremiumNavigator(fn) {
  premiumNavigator = typeof fn === "function" ? fn : null;
}

export function openPremium(intent) {
  if (!premiumNavigator) return false;
  setPremiumIntent(intent);
  premiumNavigator();
  return true;
}

export function consumePremiumIntent() {
  const value = pending;
  pending = null;
  return value;
}
