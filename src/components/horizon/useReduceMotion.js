import { useCallback, useEffect, useRef, useState } from "react";

// Préférence « Réduire les animations » : s'ajoute à la préférence système
// prefers-reduced-motion (jamais ne la contredit : si le système demande moins
// de mouvement, c'est toujours réduit). Mémorisée dans localStorage ; tous les
// accès sont protégés (navigation privée, stockage bloqué, aperçus).
//
// Valable pour TOUTE l'app (page d'accueil, connexion, écrans connectés) : le
// choix pose data-motion="reduce" sur <html> (voir index.html, qui l'applique
// avant le premier rendu) et tous les composants qui utilisent ce hook restent
// synchronisés via un événement fenêtre — l'interrupteur des Réglages agit donc
// immédiatement sur l'arbre animé et le fond, sans rechargement.
export const REDUCE_MOTION_KEY = "bb-reduce-motion";
export const REDUCE_MOTION_EVENT = "bb-reduce-motion-change";

function readManual() {
  try {
    return localStorage.getItem(REDUCE_MOTION_KEY) === "1";
  } catch {
    return false;
  }
}

function applyManual(value) {
  try {
    if (typeof document === "undefined") return;
    if (value) document.documentElement.setAttribute("data-motion", "reduce");
    else document.documentElement.removeAttribute("data-motion");
  } catch {
    /* décoratif : sans effet si le document est indisponible */
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

  // Synchronisation : un autre composant (ou un autre onglet) a changé le réglage.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    // La valeur voyage dans l'événement : si le stockage est bloqué, relire
    // localStorage annulerait le choix qui vient d'être fait.
    const sync = (e) => setManual(typeof e?.detail?.manual === "boolean" ? e.detail.manual : readManual());
    const onStorage = (e) => {
      if (e.key !== null && e.key !== REDUCE_MOTION_KEY) return;
      setManual(readManual());
    };
    window.addEventListener(REDUCE_MOTION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(REDUCE_MOTION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // L'attribut de <html> reflète le réglage manuel (le système est déjà couvert
  // par la media query prefers-reduced-motion des feuilles de style).
  useEffect(() => {
    applyManual(manual);
  }, [manual]);

  const manualRef = useRef(manual);
  manualRef.current = manual;

  const toggle = useCallback(() => {
    const next = !manualRef.current;
    try {
      if (next) localStorage.setItem(REDUCE_MOTION_KEY, "1");
      else localStorage.removeItem(REDUCE_MOTION_KEY);
    } catch {
      /* préférence valable pour cette visite seulement */
    }
    setManual(next);
    applyManual(next);
    try {
      window.dispatchEvent(new CustomEvent(REDUCE_MOTION_EVENT, { detail: { manual: next } }));
    } catch {
      /* environnement sans événements fenêtre */
    }
  }, []);

  return { reduce: manual || system, manual, system, toggle };
}
