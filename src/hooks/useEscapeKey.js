import { useEffect, useRef } from "react";

// Pile partagée des modales actives (ordre d'ouverture). Un seul écouteur
// "keydown" global : Échap ne ferme que la plus récemment ouverte (le dessus
// de la pile), jamais toutes en même temps. Sans ça, un visualiseur d'image
// ouvert par-dessus une fiche profil (les deux utilisent ce hook) se
// refermait EN MÊME TEMPS que la fiche profil sur une seule pression d'Échap.
const stack = [];
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached || typeof document === "undefined") return;
  listenerAttached = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || stack.length === 0) return;
    stack[stack.length - 1].current();
  });
}

// Ferme une modale/un menu quand l'utilisateur appuie sur Échap.
export function useEscapeKey(active, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    ensureListener();
    // Objet stable poussé une seule fois par ouverture (pas à chaque
    // changement de référence de onClose) pour préserver l'ordre réel
    // d'empilement des modales.
    const entry = { current: () => onCloseRef.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
