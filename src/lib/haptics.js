import { isNative } from "./platform";

// Retour haptique NATIF (app Capacitor Android/iOS) via @capacitor/haptics — étape 3b.
//
// RÈGLE : sur le web, RIEN ne s'exécute — aucune vibration (navigator.vibrate n'est
// volontairement pas utilisé : comportement web inchangé) et le plugin n'est jamais
// chargé (import() dynamique derrière isNative(), chunk séparé jamais téléchargé par
// un navigateur).
//
// Contrat : les trois fonctions sont « tire et oublie » — elles renvoient immédiatement
// `undefined`, ne lèvent JAMAIS (plugin absent, appareil sans vibreur, rejet natif :
// tout est avalé) et ne retardent aucune logique appelante. Elles sont donc sûres à
// appeler en une ligne sur un chemin existant, sans await ni try/catch.
//
// Accessibilité : « Réduire les animations » (prefers-reduced-motion: reduce) coupe
// aussi les retours haptiques (le signal est relayé par Android/iOS à la WebView).
//
// Anti-rafale : au plus un retour toutes les MIN_GAP_MS (un geste qui déclenche deux
// évènements proches ne donne pas deux secousses).
//
// Le plugin n'est jamais renvoyé nu d'une fonction async (voir nativeGeolocation.js :
// le proxy Capacitor ferait lire `.then`) : il est utilisé dans la même fonction.

const MIN_GAP_MS = 120;
let lastAt = 0;

function reducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

async function fire(kind) {
  try {
    if (!isNative() || reducedMotion()) return;
    const now = Date.now();
    if (now - lastAt < MIN_GAP_MS) return;
    lastAt = now;
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
    else if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.notification({ type: NotificationType.Error });
  } catch { /* retour haptique indisponible : sans importance */ }
}

/** Petit tic : like, message envoyé, tirer pour rafraîchir. */
export function hapticLight() { fire("light"); }
/** Réussite : match, publication. */
export function hapticSuccess() { fire("success"); }
/** Erreur de validation. */
export function hapticError() { fire("error"); }

export function _resetHapticsForTests() { lastAt = 0; }
