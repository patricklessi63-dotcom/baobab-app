import { useEffect, useRef } from "react";

// Restaure le focus clavier sur l'élément qui l'avait juste avant l'ouverture
// d'un menu/popover NON modal (EmojiPicker, MessageMediaPicker, la cloche de
// notifications et le menu profil de SocialShell...) — sans piéger Tab à
// l'intérieur (ce n'est pas une modale plein écran comme PostComposerModal,
// qui a déjà ce comportement via useFocusTrap).
//
// Bug corrigé à l'audit accessibilité clavier : ces menus se ferment sur
// Échap (useEscapeKey) ou clic extérieur (useClickOutside) en démontant tout
// leur contenu. Si le focus clavier était resté sur un élément À
// L'INTÉRIEUR du menu au moment de la fermeture (ex. après avoir tabulé
// jusqu'au champ de recherche d'EmojiPicker, ou jusqu'à une notification),
// cet élément disparaissait du DOM avec le menu — le navigateur reportait
// alors le focus sur <body> (vérifié dans le navigateur intégré :
// activeElement passait de INPUT[Rechercher un emoji] à BODY après Échap).
// L'utilisateur clavier/lecteur d'écran perdait sa position dans la page et
// devait retabuler depuis le tout début.
//
// On ne restaure QUE si le focus a effectivement été perdu (activeElement
// === document.body) au prochain tick : un clic extérieur sur un AUTRE
// élément focusable (qui a légitimement reçu le focus) ne doit pas se voir
// voler ce focus fraîchement acquis.
export function useFocusReturn(active) {
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement;
    return () => {
      const target = previouslyFocused.current;
      if (!target || !document.body.contains(target)) return;
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) target.focus();
      });
    };
  }, [active]);
}
