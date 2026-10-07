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
