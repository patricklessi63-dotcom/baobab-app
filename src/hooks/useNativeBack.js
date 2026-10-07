import { useEffect } from "react";
import { isNative } from "../lib/platform";
import { startNativeBack } from "../lib/nativeBack";

// Bouton Retour d'Android, à appeler UNE fois dans App.jsx. No-op complet sur le web
// (aucun écouteur, aucun import dynamique). Voir lib/nativeBack.js pour le comportement.
export function useNativeBack() {
  useEffect(() => {
    if (!isNative()) return undefined;
    let cancelled = false;
    let stop = () => {};
    // Jamais d'exception ni de rejet non géré : sans écouteur, Capacitor garde son comportement par défaut.
    Promise.resolve()
      .then(() => startNativeBack())
      .then((remove) => { if (cancelled) remove(); else stop = remove; })
      .catch(() => {});
    return () => { cancelled = true; stop(); };
  }, []);
}
