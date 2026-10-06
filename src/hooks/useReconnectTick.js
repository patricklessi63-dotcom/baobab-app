import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { useResumeTick } from "./useResumeTick";

// Compteur qui s'incrémente à chaque « occasion de réessayer » : retour de la
// connexion (évènement online) OU reprise après une longue veille (voir
// useResumeTick). Sert aux écrans dont le chargement a échoué : sans lui, un
// chargement raté (métro, réseau muet au lancement) laissait une liste vide,
// indiscernable d'une liste réellement vide, jusqu'à un rechargement manuel.
// Le premier rendu ne déclenche rien (tick = 0).
export function useReconnectTick() {
  const { isOnline } = useOnlineStatus();
  const resumeTick = useResumeTick();
  const [onlineTick, setOnlineTick] = useState(0);
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) setOnlineTick((t) => t + 1);
    prevOnlineRef.current = isOnline;
  }, [isOnline]);
  return onlineTick + resumeTick;
}
