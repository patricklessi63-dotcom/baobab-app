import React from "react";

// Logo Baobab — silhouette d'arbre (canopée en 5 cercles, tronc large évasé,
// trois racines) avec un fruit or en accent. Purement décoratif (aria-hidden) :
// partout où il apparaît, un texte visible porte déjà le nom « Baobab ».
// `color` pilote l'arbre (currentColor par défaut) ; le fruit reste or fixe
// pour rester lisible quelle que soit la couleur de l'arbre.
export default function BaobabLogo({ size = 24, color = "currentColor", className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <g fill={color}>
        <circle cx="48" cy="30" r="22" />
        <circle cx="74" cy="30" r="22" />
        <circle cx="34" cy="56" r="20" />
        <circle cx="86" cy="56" r="20" />
        <circle cx="60" cy="50" r="34" />
        <path d="M46 98 L42 66 L78 66 L74 98 Z" />
      </g>
      <g stroke={color} strokeWidth="6" strokeLinecap="round">
        <line x1="52" y1="95" x2="34" y2="110" />
        <line x1="60" y1="97" x2="60" y2="114" />
        <line x1="68" y1="95" x2="86" y2="110" />
      </g>
      <circle cx="90" cy="38" r="6.5" fill="#D9A441" />
    </svg>
  );
}
