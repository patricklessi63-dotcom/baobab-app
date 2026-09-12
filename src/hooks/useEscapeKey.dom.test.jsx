import { describe, it, expect, vi } from "vitest";
import { pushBackEntry } from "./useEscapeKey";

// pushBackEntry est la primitive partagée par useEscapeKey() (modales) ET par
// la navigation par onglets de SocialShell.jsx (goTab/goBack, ajoutées le 12
// sept. pour que le bouton/geste "retour" mobile remonte d'un écran à la fois
// au lieu de quitter l'app dès le premier appui). Les deux usages partagent
// la MÊME pile module-scope (non exportée, testée uniquement via son
// comportement observable) — ce fichier vérifie surtout la garantie qui
// motive ce partage : un seul appui sur "retour" ne referme jamais deux
// niveaux à la fois, quel que soit qui les a poussés.
//
// Chaque test appelle release() DEPUIS son propre onClose, exactement comme
// le fait le vrai code appelant (useEscapeKey via le nettoyage de son
// useEffect, goTab explicitement) — sans ça, l'entrée resterait sur la pile
// module-scope PARTAGÉE ENTRE LES TESTS de ce fichier et polluerait les tests
// suivants (pile jamais réinitialisée entre les tests, comme en production).
describe("pushBackEntry (pile de retour partagée)", () => {
  it("consomme l'entrée sur un popstate simulé (retour matériel/geste mobile)", () => {
    const onClose = vi.fn();
    let release;
    release = pushBackEntry(() => { release(); onClose(); });

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ferme uniquement l'entrée la plus récente (ordre LIFO), jamais les deux à la fois", () => {
    // Reproduit le scénario qui motive le partage de la pile : une modale
    // (useEscapeKey) ouverte par-dessus un écran secondaire (goTab) — un
    // seul appui sur "retour" ne doit fermer QUE la modale, pas les deux.
    const onCloseTab = vi.fn();
    const onCloseModal = vi.fn();
    let releaseTab, releaseModal;
    releaseTab = pushBackEntry(() => { releaseTab(); onCloseTab(); }); // ex. entrée Communautés (goTab)
    releaseModal = pushBackEntry(() => { releaseModal(); onCloseModal(); }); // modale ouverte par-dessus

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onCloseModal).toHaveBeenCalledTimes(1);
    expect(onCloseTab).not.toHaveBeenCalled();

    // Un 2e retour révèle bien le niveau du dessous.
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onCloseTab).toHaveBeenCalledTimes(1);
  });

  it("libère elle-même l'entrée consommée : un 2e retour révèle le niveau suivant, jamais le même", () => {
    // C'est le bug qu'un release() manquant dans goTab aurait produit : sans
    // lui, l'entrée consommée resterait indéfiniment en haut de la pile et un
    // 2e appui sur "retour" rappellerait le MÊME onClose au lieu de révéler
    // l'écran encore avant — l'utilisateur resterait bloqué à un seul niveau
    // de profondeur quel que soit le nombre d'onglets visités.
    const onCloseLevel1 = vi.fn();
    const onCloseLevel2 = vi.fn();
    let releaseLevel1, releaseLevel2;
    releaseLevel1 = pushBackEntry(() => { releaseLevel1(); onCloseLevel1(); });
    releaseLevel2 = pushBackEntry(() => { releaseLevel2(); onCloseLevel2(); });

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onCloseLevel2).toHaveBeenCalledTimes(1);
    expect(onCloseLevel1).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onCloseLevel1).toHaveBeenCalledTimes(1);

    // Les deux entrées ont bien été retirées : un 3e retour ne rappelle plus rien.
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onCloseLevel1).toHaveBeenCalledTimes(1);
    expect(onCloseLevel2).toHaveBeenCalledTimes(1);
  });

  it("une fermeture programmatique (clic sur le bouton Retour visible, pas le retour matériel) ne rappelle jamais onClose", () => {
    const onClose = vi.fn();
    const release = pushBackEntry(onClose);
    release();
    expect(onClose).not.toHaveBeenCalled();
  });
});
