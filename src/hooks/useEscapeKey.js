import { useEffect } from "react";

// Ferme une modale/un menu quand l'utilisateur appuie sur Échap.
export function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, onClose]);
}
