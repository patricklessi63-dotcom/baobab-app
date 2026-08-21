import React from "react";
import { card, muted, primary, gold, coral } from "./social/theme";

// Carte de remplissage informative — utilisée pour ne pas laisser une
// rangée à balayage horizontal quasi vide quand peu de communautés/
// événements réels existent encore (Baobab en début de croissance).
// Contenu = conseils génériques, jamais une statistique inventée (aucun
// nombre fictif présenté comme réel, cf. audit QA). Zone visuelle en
// dégradé de marque + icône vectorielle, même gabarit que les vraies
// cartes (CommunityGroupCard/EventCard) — pas d'emoji brut sur aplat.
export default function InfoTipCard({ icon: Icon, title, text }) {
  return (
    <div className={`${card} overflow-hidden w-56 flex-shrink-0`} style={{ scrollSnapAlign: "start" }} aria-hidden="true">
      <div className="h-28 flex items-center justify-center" style={{ background: `linear-gradient(150deg,${gold},${coral})` }}>
        <Icon size={30} color="#fff" strokeWidth={1.75} />
      </div>
      <div className="p-4">
        <h3 className="text-sm font-black" style={{ color: primary }}>{title}</h3>
        <p className="text-xs mt-1 leading-5" style={{ color: muted }}>{text}</p>
      </div>
    </div>
  );
}
