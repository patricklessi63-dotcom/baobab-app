import { isNative } from "./platform";

// Enveloppe fine autour de @capacitor/app (état premier plan/arrière-plan,
// ouverture par URL). RÈGLE : sur le web, rien ne s'exécute et le plugin n'est
// jamais chargé (import() dynamique derrière isNative()), comme nativeUi.js.

const noop = () => {};

function remover(handle) {
  return () => {
    try {
      Promise.resolve(handle.remove()).catch(noop);
    } catch { /* ignore */ }
  };
}

/** cb({ isActive }) à chaque passage premier plan / arrière-plan. Retourne le désabonnement. */
export async function onAppStateChange(cb) {
  if (!isNative()) return noop;
  try {
    const { App } = await import("@capacitor/app");
    return remover(await App.addListener("appStateChange", (state) => cb({ isActive: state?.isActive === true })));
  } catch {
    return noop;
  }
}

/** cb(url) quand l'app est ouverte par un lien (App Links / Universal Links). */
export async function onAppUrlOpen(cb) {
  if (!isNative()) return noop;
  try {
    const { App } = await import("@capacitor/app");
    return remover(await App.addListener("appUrlOpen", (event) => cb(event?.url)));
  } catch {
    return noop;
  }
}

/** URL qui a lancé l'app à froid (ou null). */
export async function getLaunchUrl() {
  if (!isNative()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const r = await App.getLaunchUrl();
    return typeof r?.url === "string" ? r.url : null;
  } catch {
    return null;
  }
}

/**
 * cb({ canGoBack }) à chaque appui sur le bouton/geste Retour d'Android. Tant qu'un
 * écouteur existe, Capacitor ne fait PLUS lui-même « retour dans l'historique » : c'est
 * le callback qui décide (voir nativeBack.js). Retourne le désabonnement (après quoi le
 * comportement par défaut de Capacitor revient). Sans effet sur iOS (pas de bouton).
 */
export async function onBackButton(cb) {
  if (!isNative()) return noop;
  try {
    const { App } = await import("@capacitor/app");
    return remover(await App.addListener("backButton", (event) => cb({ canGoBack: event?.canGoBack === true })));
  } catch {
    return noop;
  }
}

/** Renvoie l'app à l'arrière-plan (Android : moveTaskToBack). Jamais d'exception. */
export async function minimizeApp() {
  if (!isNative()) return;
  try {
    const { App } = await import("@capacitor/app");
    await App.minimizeApp();
  } catch { /* ignore */ }
}
