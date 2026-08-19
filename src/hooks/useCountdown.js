import { useEffect, useState } from "react";

// Compte à rebours en secondes (ex. cooldown avant de pouvoir renvoyer un
// email). Retourne [secondsLeft, start] — start(45) lance/relance le compte.
export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return [secondsLeft, setSecondsLeft];
}
