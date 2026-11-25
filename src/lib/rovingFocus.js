// Navigation clavier dans une rangée d'éléments (onglets, menu de réactions) : flèches gauche/droite (ou haut/bas),
// Début et Fin, en boucle aux extrémités — le modèle attendu par les lecteurs d'écran pour role="tablist" et role="menu".
// Retourne l'index à focaliser, ou null si la touche ne concerne pas la navigation (le navigateur garde son comportement).
export function nextIndexForKey(key, index, count) {
  if (!(count > 0)) return null;
  const i = index >= 0 && index < count ? index : 0;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (i + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (i - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

// Déplace le focus entre les éléments `selector` du conteneur de l'événement clavier. À brancher sur onKeyDown du
// conteneur. Retourne true quand la touche a été prise en charge.
export function moveFocusWithin(event, selector) {
  const items = Array.from(event.currentTarget.querySelectorAll(selector));
  const current = items.indexOf(event.target);
  if (current < 0) return false;
  const next = nextIndexForKey(event.key, current, items.length);
  if (next === null) return false;
  event.preventDefault();
  items[next].focus();
  return true;
}
