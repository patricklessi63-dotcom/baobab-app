import { useEffect, useState } from "react";

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
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (hiddenAt == null) hiddenAt = Date.now();
        return;
      }
      const now = Date.now();
      const awayFor = hiddenAt == null ? 0 : now - hiddenAt;
      hiddenAt = null;
      if (awayFor < minAwayMs) return;
      if (now - lastTickAt < minIntervalMs) return;
      lastTickAt = now;
      setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [minAwayMs, minIntervalMs]);

  return tick;
}
