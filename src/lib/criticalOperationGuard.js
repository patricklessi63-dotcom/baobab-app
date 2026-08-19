// Registre partagé minimal — permet à des composants sans relation
// parent/enfant directe (PostsFeed.jsx, SocialShell.jsx) de signaler
// qu'une opération critique (publication, upload) est en cours, pour
// que la déconnexion automatique par inactivité (App.jsx) puisse
// différer la coupure plutôt que d'interrompre brutalement. Compteur
// simple (pas de Context) : plusieurs opérations peuvent se chevaucher.
let activeCount = 0;

export function beginCriticalOperation() {
  activeCount += 1;
}

export function endCriticalOperation() {
  activeCount = Math.max(0, activeCount - 1);
}

export function isCriticalOperationActive() {
  return activeCount > 0;
}
