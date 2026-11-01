import React from "react";
import "../../styles/horizon-stage.css";

// Indicateur de chargement aux couleurs Horizon : l'arbre dont les nœuds
// pulsent en cascade, avec une étiquette en police mono. role="status" pour
// les lecteurs d'écran ; l'animation s'arrête avec « Réduire les animations ».
export default function HorizonLoader({ label = "Chargement" }) {
  return (
    <div className="hzs-loader" role="status" aria-live="polite">
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M13 29c1.4-5.4 1-9.6-1.2-12.6h8.4C18 19.4 17.6 23.6 19 29z" fill="currentColor" opacity=".9" />
        <g stroke="#62F0BA" strokeWidth="1.2" fill="#62F0BA">
          <path d="M16 16 6 9M16 16 11 5M16 16l5-11M16 16l10-7" fill="none" />
          <circle className="dot" cx="6" cy="9" r="1.9" />
          <circle className="dot" cx="11" cy="5" r="1.9" />
          <circle className="dot" cx="21" cy="5" r="1.9" />
          <circle className="dot" cx="26" cy="9" r="1.9" />
        </g>
        <path d="M10 29h12" stroke="#F2A33A" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p>{label}</p>
    </div>
  );
}
