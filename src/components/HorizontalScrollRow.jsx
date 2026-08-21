import React, { useEffect, useRef } from "react";

// Rangée à balayage horizontal, mobile ET desktop. Le tactile fonctionne
// nativement avec overflow-x-auto (rien à faire) ; pour la souris/trackpad
// sur PC, on convertit le défilement vertical (molette) en défilement
// horizontal tant que le pointeur survole la rangée, et on ajoute un
// glisser-déposer à la souris (clic-maintenu) pour un vrai geste "swipe".
export default function HorizontalScrollRow({ children, className = "" }) {
  const ref = useRef(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  // React attache onWheel comme écouteur passif (impossible d'y appeler
  // preventDefault — jetait "Unable to preventDefault inside passive event
  // listener" en boucle et laissait la page défiler verticalement EN PLUS
  // du défilement horizontal). Un écouteur natif { passive: false } est le
  // seul moyen fiable de vraiment intercepter le geste.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handlePointerDown = (e) => {
    if (e.pointerType === "touch") return; // le tactile a déjà son propre swipe natif
    const el = ref.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const endDrag = (e) => {
    if (!drag.current.active) return;
    // Empêche le clic sur la carte de se déclencher juste après un glisser.
    if (drag.current.moved) e.preventDefault?.();
    drag.current.active = false;
  };

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={(e) => { if (drag.current.moved) { e.stopPropagation(); drag.current.moved = false; } }}
      className={`flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 cursor-grab active:cursor-grabbing ${className}`}
      style={{ scrollbarWidth: "none", scrollSnapType: "x proximity" }}
    >
      {children}
    </div>
  );
}
