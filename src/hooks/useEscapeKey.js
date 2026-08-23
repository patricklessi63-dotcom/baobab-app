import { useEffect, useRef } from "react";

// Pile partagée des modales actives (ordre d'ouverture). Deux écouteurs
// globaux — clavier (Échap) ET bouton/geste "retour" (popstate) — ferment
// tous les deux uniquement la plus récemment ouverte (le dessus de la
// pile), jamais toutes en même temps. Sans le premier écouteur, un
// visualiseur d'image ouvert par-dessus une fiche profil (les deux
// utilisent ce hook) se refermait EN MÊME TEMPS que la fiche profil sur une
// seule pression d'Échap. Sans le second, le bouton "retour" du mobile (ou
// le geste système, ou le bouton retour du navigateur) n'avait aucune
// entrée d'historique à consommer pour une modale/un menu ouvert en JS pur
// (pas de changement d'URL) — il quittait donc directement l'application
// au lieu de fermer ce qui était ouvert ("le bouton retour permet
// d'annuler l'action précédente et non de sortir de l'application").
const stack = [];
let listenersAttached = false;
// Nombre de popstate à venir déclenchés par NOUS (history.back() appelé
// depuis le nettoyage ci-dessous, pas par l'utilisateur) — sans ce
// compteur, notre propre appel à history.back() (pour consommer l'entrée
// poussée à l'ouverture) redéclencherait le même traitement que si
// l'utilisateur avait appuyé sur "retour", fermant en cascade une AUTRE
// modale encore ouverte en dessous.
let suppressPopstateCount = 0;

function ensureListeners() {
  if (listenersAttached || typeof document === "undefined") return;
  listenersAttached = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || stack.length === 0) return;
    stack[stack.length - 1].onClose();
  });
  window.addEventListener("popstate", () => {
    if (suppressPopstateCount > 0) { suppressPopstateCount--; return; }
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    entry.consumedByPopstate = true; // le nettoyage n'a pas besoin de consommer une entrée déjà consommée par ce popstate
    entry.onClose();
  });
}

// Ferme une modale/un menu quand l'utilisateur appuie sur Échap OU sur
// "retour" (bouton navigateur, geste mobile, bouton matériel Android).
export function useEscapeKey(active, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    ensureListeners();
    // Objet stable poussé une seule fois par ouverture (pas à chaque
    // changement de référence de onClose) pour préserver l'ordre réel
    // d'empilement des modales.
    const entry = { onClose: () => onCloseRef.current(), consumedByPopstate: false };
    stack.push(entry);
    // Marqueur d'historique sans changement d'URL (pathname/route inchangés
    // — usePathname() ignore les popstate à valeur identique) : sert
    // uniquement à donner au bouton "retour" quelque chose à consommer.
    window.history.pushState({ bbOverlay: true }, "");
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      // Fermeture programmatique (clic sur X, clic extérieur, Échap...),
      // pas via "retour" : on consomme nous-mêmes l'entrée d'historique
      // poussée à l'ouverture, pour ne pas laisser une entrée fantôme qui
      // forcerait à appuyer deux fois sur "retour" pour vraiment reculer.
      if (!entry.consumedByPopstate) {
        suppressPopstateCount++;
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
