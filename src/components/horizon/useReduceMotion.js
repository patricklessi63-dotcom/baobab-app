import { useCallback, useEffect, useState } from "react";

// Préférence « Réduire les animations » des pages Horizon : s'ajoute à la
// préférence système prefers-reduced-motion (jamais ne la contredit : si le
// système demande moins de mouvement, c'est toujours réduit). Mémorisée dans
// localStorage ; tous les accès sont protégés (navigation privée, stockage
// bloqué, aperçus).
export const REDUCE_MOTION_KEY = "bb-reduce-motion";

function readManual() {
  try {
    return localStorage.getItem(REDUCE_MOTION_KEY) === "1";
  } catch {
    return false;
  }
}

function systemQuery() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  } catch {
    return null;
  }
}

export function useReduceMotion() {
  const [manual, setManual] = useState(readManual);
  const [system, setSystem] = useState(() => systemQuery()?.matches === true);

  useEffect(() => {
    const mq = systemQuery();
    if (!mq) return undefined;
    const onChange = () => setSystem(mq.matches === true);
    onChange();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    if (typeof mq.addListener === "function") {
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
    return undefined;
  }, []);

  const toggle = useCallback(() => {
    setManual((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(REDUCE_MOTION_KEY, "1");
        else localStorage.removeItem(REDUCE_MOTION_KEY);
      } catch {
        /* préférence valable pour cette visite seulement */
      }
      return next;
    });
  }, []);

  return { reduce: manual || system, manual, system, toggle };
}
