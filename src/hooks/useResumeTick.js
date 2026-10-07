import { useEffect, useState } from "react";
import { isNative } from "../lib/platform";
import { onAppStateChange } from "../lib/nativeApp";

// Signal de « reprise » : renvoie un compteur qui s'incrémente quand l'onglet/
// l'app redevient visible après avoir été masqué au moins `minAwayMs`
// (changement d'application, écran verrouillé, mise en veille du téléphone).
//
// Pourquoi (audit réseau, 6 oct. 2026) : les resynchronisations existantes ne
// se déclenchent que sur l'évènement `online` (useOnlineStatus). Or un
// téléphone mis en veille ne voit PAS passer d'évènement `online` : le système
// coupe le websocket Realtime en arrière-plan, la connexion Wi-Fi/4G reste
// « en ligne » pour le navigateur, et au retour les canaux postgres_changes
// ne rejouent rien de ce qui a été manqué — messages, notifications, likes
// reçus pendant la veille n'apparaissaient qu'après un rechargement complet.
//
// App native (Capacitor) : la WebView peut être gelée en arrière-plan et
// `visibilitychange` n'y est pas toujours émis ; `appStateChange` de
// @capacitor/app est alors la source de vérité. Les deux évènements alimentent
// les MÊMES fonctions (onHidden/onShown) avec le MÊME état (hiddenAt,
// lastTickAt) : si les deux arrivent pour un même retour au premier plan, le
// second ne compte pas (l'absence est déjà remise à zéro, et minIntervalMs
// borne de toute façon la fréquence) — jamais de double déclenchement. Sur le
// web, rien de natif n'est chargé : comportement inchangé.
//
// Limitation de fréquence : pas de signal si l'absence a duré moins de
// `minAwayMs` (aller-retour rapide entre applications) ni plus d'une fois
// toutes les `minIntervalMs`. Le premier rendu ne déclenche rien (tick = 0).
export const RESUME_MIN_AWAY_MS = 60 * 1000;
export const RESUME_MIN_INTERVAL_MS = 15 * 1000;

export function useResumeTick({ minAwayMs = RESUME_MIN_AWAY_MS, minIntervalMs = RESUME_MIN_INTERVAL_MS } = {}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;
    let lastTickAt = 0;
    const onHidden = () => {
      if (hiddenAt == null) hiddenAt = Date.now();
    };
    const onShown = () => {
      const now = Date.now();
      const awayFor = hiddenAt == null ? 0 : now - hiddenAt;
      hiddenAt = null;
      if (awayFor < minAwayMs) return;
      if (now - lastTickAt < minIntervalMs) return;
      lastTickAt = now;
      setTick((t) => t + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHidden();
      else onShown();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let cancelled = false;
    let removeAppState = () => {};
    if (isNative()) {
      onAppStateChange(({ isActive }) => {
        if (cancelled) return;
        if (isActive) onShown();
        else onHidden();
      }).then((remove) => {
        if (cancelled) remove();
        else removeAppState = remove;
      });
    }
    return () => {
      cancelled = true;
      removeAppState();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [minAwayMs, minIntervalMs]);

  return tick;
}
