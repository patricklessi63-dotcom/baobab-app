import { useEffect } from "react";

// Ferme un menu/popover au clic (ou toucher) en dehors de l'élément référencé.
// `active` évite d'attacher un listener global quand le panneau est fermé.
export function useClickOutside(ref, active, onOutside) {
  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [active, onOutside, ref]);
}
