import { useEffect, useRef, useState } from "react";

// Détection de connectivité globale (item 30) — auparavant l'app ne
// remarquait une coupure qu'après l'échec d'une requête individuelle,
// jamais de manière proactive. "justReconnected" reste vrai quelques
// secondes après le retour en ligne pour afficher un message transitoire.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setJustReconnected(false), 4000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isOnline, justReconnected };
}
