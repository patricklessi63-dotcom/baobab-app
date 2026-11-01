import React from "react";

// Fond « horizon » de l'app : deux halos qui respirent (sève, braise) et un
// balayage lumineux très discret — voir .bb-horizon-bg dans index.html.
// Calque fixe, décoratif, purement CSS (aucun coût JavaScript) ; les
// animations sont coupées par « Réduire les animations » (data-motion) et par
// prefers-reduced-motion.
export default function HorizonBackdrop() {
  return (
    <div className="bb-horizon-bg" aria-hidden="true">
      <i />
    </div>
  );
}
