import { useCallback, useEffect, useRef, useState } from "react";

// Tirer pour rafraîchir (geste tactile), sans dépendance.
//
// Principe : on n'intercepte JAMAIS le défilement (écouteurs passifs, aucun
// preventDefault). On mesure seulement le glissement vertical d'un doigt qui a
// commencé son geste alors que la page est TOUT EN HAUT ; si l'écart dépasse
// `threshold` (70 px) au relâchement, on appelle `onRefresh` (une fonction de
// rechargement qui existe déjà dans l'écran appelant). Le défilement normal
// (vers le bas, ou à partir d'un autre endroit que le haut de page) n'est pas
// affecté : tout geste qui ne remplit pas toutes les conditions est ignoré.
//
// `overscroll-behavior-y: contain` est posé sur <html> tant que le hook est
// actif : sans lui, Chrome Android déclenche en plus SON rafraîchissement natif
// (rechargement de la page entière) par-dessus le nôtre. Restauré au démontage.
//
// Conditions pour qu'un geste compte :
//  - `enabled` (désactivé par l'appelant pendant une action en cours, ex.
//    envoi, chargement, ouverture d'une conversation) et pas déjà en train de
//    rafraîchir ;
//  - un seul doigt ;
//  - la page ET chaque conteneur défilant ancêtre du point touché sont à
//    scrollTop 0 (sinon c'est un simple défilement vers le haut) ;
//  - aucune boîte de dialogue modale ouverte ;
//  - mouvement surtout vertical vers le bas (un balayage horizontal, ex. rangée
//    de stories, n'est pas un tirage).

const DEFAULT_THRESHOLD = 70;
const MAX_PULL = 120;
const MIN_VISIBLE_MS = 500;

function pageScrollTop() {
  const el = document.scrollingElement || document.documentElement;
  return el ? el.scrollTop : window.scrollY || 0;
}

/** true si un ancêtre défilant verticalement du point touché n'est pas en haut. */
function scrolledAncestor(target) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

export function usePullToRefresh({ onRefresh, enabled = true, threshold = DEFAULT_THRESHOLD } = {}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const run = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      await onRefreshRef.current?.();
    } catch (e) {
      console.error(e);
    } finally {
      // Indicateur visible un minimum de temps : un rechargement instantané
      // (déjà en cache) donnerait sinon un simple clignotement.
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt));
      setTimeout(() => {
        refreshingRef.current = false;
        if (aliveRef.current) setRefreshing(false);
      }, wait);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";

    let tracking = false;
    let startY = 0;
    let startX = 0;
    let lastPull = 0;

    const reset = () => {
      tracking = false;
      if (lastPull !== 0) { lastPull = 0; setPull(0); }
    };

    const onStart = (e) => {
      reset();
      if (refreshingRef.current) return;
      if (!e.touches || e.touches.length !== 1) return;
      if (pageScrollTop() > 0) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (scrolledAncestor(e.target)) return;
      tracking = true;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    };

    const onMove = (e) => {
      if (!tracking) return;
      if (!e.touches || e.touches.length !== 1) { reset(); return; }
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      // Vers le haut, ou page quittée du haut, ou geste plutôt horizontal : on laisse faire le navigateur.
      if (dy <= 0 || pageScrollTop() > 0 || Math.abs(dx) > Math.abs(dy)) { reset(); return; }
      const next = Math.min(MAX_PULL, Math.round(dy));
      if (next !== lastPull) { lastPull = next; setPull(next); }
    };

    const onEnd = () => {
      if (!tracking) return;
      const reached = lastPull >= threshold;
      reset();
      if (reached) run();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      root.style.overscrollBehaviorY = previous;
      if (aliveRef.current) setPull(0);
    };
  }, [enabled, threshold, run]);

  return { pull, refreshing, threshold };
}
