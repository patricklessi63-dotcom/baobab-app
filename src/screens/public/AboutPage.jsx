import React from "react";
import PublicPageShell from "./PublicPageShell";

// Copie reprise telle quelle de la modal "À propos" existante
// (AppModals.jsx) — même texte, nouvelle URL publique.
export default function AboutPage({ navigate }) {
  return (
    <PublicPageShell title="À propos" navigate={navigate}>
      <p>L'app de rencontres pensée pour la communauté qui s'installe au Canada.</p>
      <p className="mt-4" style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.06em", color: "rgba(242,233,220,0.5)" }}>
        BAOBAB — BY LESSI PATRICK
      </p>
    </PublicPageShell>
  );
}
