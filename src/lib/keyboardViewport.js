import { useEffect, useState } from "react";

// Clavier virtuel sur mobile WEB (Safari iOS, Chrome Android) : le clavier ne
// redimensionne pas la fenêtre de mise en page, seulement le « visual
// viewport ». La conversation (hauteur calculée en dvh) gardait donc sa
// hauteur et le clavier recouvrait la barre de saisie et les derniers messages,
// ou obligeait la page entière à défiler (en-tête hors écran).
//
// Détection : le visual viewport est nettement plus court que la fenêtre
// (> 120 px) ET sans zoom pincé (scale ≈ 1 : un pincement réduit aussi sa
// hauteur). Dans l'app native Capacitor (Keyboard.resize "native", WebView
// redimensionnée par le système), window.innerHeight rétrécit en même temps que
// le visual viewport : l'écart reste nul, rien n'est détecté et ce code est
// inerte — le comportement natif n'est pas modifié.

export const KEYBOARD_MIN_GAP_PX = 120;

/** @returns {{top:number,height:number}|null} zone réellement visible, ou null (pas de clavier) */
export function computeKeyboardViewport({ innerHeight, vvHeight, vvOffsetTop = 0, vvScale = 1 }) {
  if (![innerHeight, vvHeight, vvOffsetTop, vvScale].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if (vvScale > 1.01) return null;
  if (innerHeight - vvHeight <= KEYBOARD_MIN_GAP_PX) return null;
  return { top: Math.max(0, Math.round(vvOffsetTop)), height: Math.round(vvHeight) };
}

/**
 * Suit le visual viewport quand `enabled` (écran étroit, conversation ouverte).
 * Retourne la zone visible quand le clavier est ouvert, sinon null.
 */
export function useKeyboardViewport(enabled) {
  const [area, setArea] = useState(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !vv) { setArea(null); return undefined; }
    const update = () => {
      const narrow = window.innerWidth < 768;
      const next = narrow ? computeKeyboardViewport({ innerHeight: window.innerHeight, vvHeight: vv.height, vvOffsetTop: vv.offsetTop, vvScale: vv.scale }) : null;
      setArea((prev) => (prev && next && prev.top === next.top && prev.height === next.height ? prev : next));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setArea(null);
    };
  }, [enabled]);
  return area;
}
