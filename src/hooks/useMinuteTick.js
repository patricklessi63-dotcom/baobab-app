import { useEffect, useState } from "react";

const MINUTE_MS = 60 * 1000;

// Re-rend le composant une fois par minute (heures relatives, « vu il y a… », âge d'une notification…).
// Aucun minuteur tant que l'onglet est caché ; au retour (visibilitychange) il re-rend aussitôt, puis reprend le rythme.
export function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer = null;
    const bump = () => setTick((t) => t + 1);
    const start = () => { if (timer === null) timer = setInterval(bump, MINUTE_MS); };
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") stop();
      else { bump(); start(); }
    };
    if (typeof document === "undefined" || document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
}
