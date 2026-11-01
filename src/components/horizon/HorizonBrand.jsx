import React from "react";
import "../../styles/horizon-stage.css";

// Pictogramme de l'arbre (le même que la page d'accueil Horizon) : tronc
// ivoire, branches et nœuds en « signal », racine braise. Les couleurs sont
// fixes : elles restent lisibles sur le fond sombre comme sur l'ivoire.
export function HorizonMark({ size = 30, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M13 29c1.4-5.4 1-9.6-1.2-12.6h8.4C18 19.4 17.6 23.6 19 29z" fill="#F3EEE4" opacity=".92" />
      <g stroke="#62F0BA" strokeWidth="1.2" fill="#62F0BA">
        <path d="M16 16 6 9M16 16 11 5M16 16l5-11M16 16l10-7" fill="none" />
        <circle cx="6" cy="9" r="1.9" />
        <circle cx="11" cy="5" r="1.9" />
        <circle cx="21" cy="5" r="1.9" />
        <circle cx="26" cy="9" r="1.9" />
      </g>
      <path d="M10 29h12" stroke="#F2A33A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Marque complète : pictogramme + « BAOBAB » (Syne 800, capitales espacées).
// Le nom visible porte l'étiquette accessible : le pictogramme est décoratif.
export default function HorizonBrand({ size = 30, showName = true, className = "" }) {
  return (
    <span className={`hzs-brand ${className}`}>
      <HorizonMark size={size} />
      {showName && <span>BAOBAB</span>}
    </span>
  );
}
