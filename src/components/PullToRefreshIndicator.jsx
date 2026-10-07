import React from "react";
import { ArrowDown, Loader2 } from "lucide-react";

// Indicateur discret du « tirer pour rafraîchir » (voir hooks/usePullToRefresh.js).
// Pastille ronde sous l'en-tête (74 px + zone sûre haute) qui apparaît en
// descendant avec le doigt, tourne la flèche une fois le seuil atteint, puis
// affiche un spinner pendant le rechargement. Ne capte aucun geste
// (pointer-events: none) et ne rend RIEN au repos.
export default function PullToRefreshIndicator({ pull, refreshing, threshold = 70 }) {
  if (!refreshing && pull <= 0) return null;
  const progress = Math.min(1, pull / threshold);
  const offset = refreshing ? 12 : Math.min(pull, 100) * 0.5 - 36;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-30 pointer-events-none flex items-center justify-center rounded-full"
      style={{
        top: "calc(74px + env(safe-area-inset-top, 0px))",
        width: 36,
        height: 36,
        marginLeft: -18,
        transform: `translateY(${offset}px)`,
        opacity: refreshing ? 1 : progress,
        background: "var(--bb-surface)",
        border: "1px solid var(--bb-border)",
        boxShadow: "var(--bb-shadow-md)",
        color: "var(--bb-text)",
        transition: refreshing ? "transform .2s ease" : "none",
      }}
    >
      {refreshing ? (
        <>
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          <span className="sr-only">Actualisation…</span>
        </>
      ) : (
        <ArrowDown size={18} aria-hidden="true" style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)`, transition: "transform .15s ease" }} />
      )}
    </div>
  );
}
