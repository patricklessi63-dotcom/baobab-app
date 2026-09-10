import React from "react";

// Marque Baobab — direction « Racines » : silhouette de baobab (canopée en
// cinq cercles, tronc évasé, deux racines) avec un petit fruit en accent.
// Remplace l'emoji 🌳 utilisé jusqu'ici comme repère de marque décoratif.
// `color` pilote l'arbre, `accent` le fruit — les deux acceptent n'importe
// quelle couleur CSS, ce qui permet de décliner le logo en blanc sur fond
// foncé. aria-hidden : partout où il apparaît, un texte visible porte déjà
// le nom « Baobab ».
export default function BaobabLogo({ size = 24, color = "#1E2A4F", accent = "#D9A441", className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="48" cy="30" r="22" fill={color} />
      <circle cx="74" cy="30" r="22" fill={color} />
      <circle cx="34" cy="56" r="20" fill={color} />
      <circle cx="86" cy="56" r="20" fill={color} />
      <circle cx="60" cy="50" r="34" fill={color} />
      <path d="M50 96 L46 68 L74 68 L70 96 Z" fill={color} />
      <path d="M46 96 L35 106 M74 96 L85 106" stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="90" cy="38" r="6.5" fill={accent} />
    </svg>
  );
}
