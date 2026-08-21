import React from "react";
import { primaryRgb } from "../constants";

// Primitif de chargement générique — aucun composant de ce type n'existait
// dans le dépôt avant la Phase 6. Générique (pas spécifique aux
// communautés) pour rester réutilisable au-delà de cette phase.
export default function Skeleton({ rows = 3, height = 14, gap = 8, widths, className = "" }) {
  const items = Array.from({ length: rows });
  return (
    <div className={`animate-pulse ${className}`} aria-hidden="true">
      {items.map((_, i) => (
        <div
          key={i}
          className="rounded-lg"
          style={{
            height,
            width: widths?.[i] || (i === items.length - 1 ? "60%" : "100%"),
            background: `rgba(${primaryRgb},.08)`,
            marginTop: i === 0 ? 0 : gap,
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`rounded-[28px] border bg-[var(--bb-surface)] p-5 animate-pulse ${className}`} style={{ borderColor: `rgba(${primaryRgb},.08)` }} aria-hidden="true">
      <div className="rounded-2xl mb-3" style={{ height: 120, background: `rgba(${primaryRgb},.08)` }} />
      <div className="rounded-lg mb-2" style={{ height: 16, width: "70%", background: `rgba(${primaryRgb},.08)` }} />
      <div className="rounded-lg" style={{ height: 12, width: "40%", background: `rgba(${primaryRgb},.08)` }} />
    </div>
  );
}
