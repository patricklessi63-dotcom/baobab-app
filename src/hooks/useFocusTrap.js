import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Déplace le focus clavier À L'INTÉRIEUR d'une modale dès son ouverture, et
// l'y maintient tant qu'elle reste ouverte : Tab/Maj+Tab bouclent parmi les
// éléments focusables de la modale au lieu d'en sortir vers le contenu
// (caché derrière l'overlay) resté en arrière-plan. Sans ce hook, le focus
// clavier restait exactement où il était avant l'ouverture — un utilisateur
// au clavier ou au lecteur d'écran pouvait continuer de tabuler dans la page
// derrière une modale visuellement au premier plan. Restaure le focus à
// l'élément précédemment actif quand la modale se ferme.
//
// `containerRef` doit pointer vers l'élément racine du panneau de la modale
// (pas l'overlay plein écran) ; cet élément doit porter `tabIndex={-1}` pour
// pouvoir recevoir le focus même s'il ne contient aucun élément focusable.
export function useFocusTrap(active, containerRef) {
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocused.current = document.activeElement;

    // requestAnimationFrame : laisse le temps au DOM (portail compris) de
    // s'établir avant de déplacer le focus, sinon le premier élément
    // focusable n'existe pas encore lors du montage.
    const raf = requestAnimationFrame(() => {
      const focusables = container.querySelectorAll(FOCUSABLE_SELECTOR);
      (focusables[0] || container).focus();
    });

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null // ignore les éléments masqués
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("keydown", handleKeyDown);
      // Ne restaure que si l'élément précédent existe encore dans le DOM
      // (il a pu être démonté pendant que la modale était ouverte).
      if (previouslyFocused.current && document.body.contains(previouslyFocused.current)) {
        previouslyFocused.current.focus();
      }
    };
  }, [active, containerRef]);
}
