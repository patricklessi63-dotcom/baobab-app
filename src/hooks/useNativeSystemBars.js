import { useEffect } from "react";
import { isNative } from "../lib/platform";
import { syncSystemBarsWithScreen, hideSplash, setupKeyboardGuard } from "../lib/nativeUi";

// Hook d'intégration native, à appeler UNE fois dans App.jsx. Sur le web c'est
// un no-op complet (aucun écouteur, aucun observateur, aucun import dynamique).
// En natif :
//  - barre d'état / barre de navigation : style (icônes claires ou sombres)
//    recalculé d'après le fond RÉELLEMENT affiché en haut et en bas de l'écran,
//    à chaque changement de thème (attribut data-theme, réglage système),
//    d'écran ou de navigation ;
//  - masque l'écran de démarrage dès que l'app est prête (`ready`) ;
//  - garde-fou clavier (voir setupKeyboardGuard).
const DEBOUNCE_MS = 300;

export function useNativeSystemBars({ ready = true } = {}) {
  useEffect(() => {
    if (!isNative()) return undefined;
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; syncSystemBarsWithScreen(); }, DEBOUNCE_MS);
    };

    const root = document.getElementById("root");
    const domObserver = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
    // Changement d'écran = remplacement d'éléments dans #root (pas d'attribut) ;
    // changement de thème = attribut data-theme sur <html>.
    if (domObserver && root) domObserver.observe(root, { childList: true, subtree: true });
    const themeObserver = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
    if (themeObserver) themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    let mql = null;
    try {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener?.("change", schedule);
    } catch { /* matchMedia indisponible */ }
    window.addEventListener("popstate", schedule);
    document.addEventListener("visibilitychange", schedule);

    syncSystemBarsWithScreen();

    return () => {
      if (timer) clearTimeout(timer);
      domObserver?.disconnect();
      themeObserver?.disconnect();
      try { mql?.removeEventListener?.("change", schedule); } catch { /* ignore */ }
      window.removeEventListener("popstate", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    if (ready) hideSplash();
  }, [ready]);

  useEffect(() => {
    if (!isNative()) return undefined;
    let cleanup = () => {};
    let cancelled = false;
    setupKeyboardGuard().then((c) => { if (cancelled) c(); else cleanup = c; });
    return () => { cancelled = true; cleanup(); };
  }, []);
}
