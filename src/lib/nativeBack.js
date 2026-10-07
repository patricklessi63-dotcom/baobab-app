import { isNative } from "./platform";
import { onBackButton, minimizeApp } from "./nativeApp";

// Bouton / geste RETOUR d'Android (app Capacitor) — étape 3b.
//
// POURQUOI PAS un nouveau registre de gestionnaires : l'app a DÉJÀ une pile de retour
// unique, fondée sur l'historique du navigateur (hooks/useEscapeKey.js : useEscapeKey,
// pushBackEntry). Chaque modale, feuille, visionneuse, la conversation ouverte
// (useEscapeKey(Boolean(activeMatch), closeChat)) et chaque changement d'onglet
// (SocialShell.goTab) y poussent une entrée + un history.pushState ; un retour
// d'historique (popstate) ferme le sommet de la pile, un seul niveau à la fois.
// C'est exactement l'ordre voulu : modale/feuille/visionneuse -> conversation -> onglets
// jusqu'à l'onglet par défaut. Un second registre dupliquerait cet ordre et pourrait
// diverger du premier (deux piles = une modale fermée deux fois ou jamais).
//
// Ce que Capacitor fait SANS écouteur « backButton » : history.back() si la WebView peut
// reculer, et RIEN SINON (l'app ne peut alors plus être quittée avec Retour). Ce module ne
// change donc rien tant que l'historique peut reculer (même geste : window.history.back()),
// et ne prend la main qu'à la RACINE : un premier appui affiche « Appuie encore pour
// quitter », un second appui dans les 2 s renvoie l'app à l'arrière-plan (minimizeApp :
// l'état et les notifications sont conservés — c'est le comportement des apps Android 12+,
// plutôt que exitApp qui tue l'activité).
//
// Web : aucun écouteur, aucun import de plugin (tout passe par isNative()).

export const ROOT_HINT = "Appuie encore pour quitter";
export const ROOT_WINDOW_MS = 2000;

/**
 * Logique pure (testable sans plugin). `goBack()` = retour d'historique, `hint()` = prévenir
 * l'utilisateur, `minimize()` = quitter vers l'arrière-plan.
 * Retourne le gestionnaire à brancher sur l'évènement backButton.
 */
export function createBackHandler({ goBack, hint, minimize, windowMs = ROOT_WINDOW_MS, now = Date.now }) {
  let lastRootPress = 0;
  return function handleBack({ canGoBack } = {}) {
    try {
      if (canGoBack) {
        lastRootPress = 0; // on vient de fermer quelque chose : le décompte « racine » repart de zéro
        goBack();
        return;
      }
      const t = now();
      if (lastRootPress && t - lastRootPress <= windowMs) {
        lastRootPress = 0;
        minimize();
        return;
      }
      lastRootPress = t;
      hint();
    } catch { /* jamais d'exception depuis un évènement natif */ }
  };
}

let hintEl = null;
let hintTimer = null;

/** Petit message flottant (role=status), retiré tout seul. Un seul à la fois. */
export function showRootHint(text = ROOT_HINT, doc = typeof document !== "undefined" ? document : null, ms = ROOT_WINDOW_MS) {
  if (!doc?.body) return;
  if (!hintEl || !hintEl.isConnected) {
    hintEl = doc.createElement("div");
    hintEl.setAttribute("role", "status");
    hintEl.setAttribute("aria-live", "polite");
    hintEl.setAttribute("data-bb-back-hint", "true");
    Object.assign(hintEl.style, {
      position: "fixed", left: "50%", transform: "translateX(-50%)", zIndex: "2147483000",
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)", maxWidth: "calc(100vw - 32px)",
      padding: "10px 16px", borderRadius: "999px", fontSize: "14px", lineHeight: "20px", textAlign: "center",
      background: "rgba(20,18,13,0.92)", color: "#F7F2EA", pointerEvents: "none",
      boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    });
    doc.body.appendChild(hintEl);
  }
  hintEl.textContent = text;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { hintEl?.remove(); hintEl = null; }, ms);
}

/**
 * Branche le bouton Retour d'Android. Retourne une promesse du désabonnement (no-op sur le web).
 * À appeler UNE fois (hooks/useNativeBack.js).
 */
export async function startNativeBack() {
  if (!isNative()) return () => {};
  const handle = createBackHandler({
    goBack: () => window.history.back(),
    hint: () => showRootHint(),
    minimize: () => { minimizeApp(); },
  });
  return onBackButton(handle);
}
