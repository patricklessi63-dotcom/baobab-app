import React from "react";
import HorizonStage from "../horizon/HorizonStage";

// Bandeau d'accueil du fil : la même scène que la page d'accueil Horizon (arbre
// animé en réseau de points, coins, balayage, légendes en police mono) avec le
// message et les deux actions par-dessus. Mêmes propriétés et mêmes textes
// qu'avant : seule l'identité visuelle change.
export default function BaobabHero({ recommendationsCount = 0, profileCompletePct = 100, onDiscover, onCompleteProfile }) {
  return (
    <HorizonStage
      className="bb-fade-in mb-7 bb-hero-stage"
      hudTop="Mon Baobab"
      treeClassName="bb-hero-tree"
    >
      <div className="bb-hero-body relative max-w-2xl p-6 pt-12 md:p-9 md:pt-12">
        <p className="bb-eyebrow" style={{ color: "var(--hz-signal)", margin: 0 }}>Ton réseau · Canada</p>
        <h2 className="bb-display text-2xl md:text-4xl mt-3" style={{ color: "var(--hz-ivoire)" }}>
          Ton cercle <span className="bb-sun-text">canadien</span> commence ici.
        </h2>
        <p className="text-sm md:text-base mt-3 leading-6 max-w-md" style={{ color: "rgba(243,238,228,0.78)" }}>
          Découvre des personnes qui partagent tes envies, tes valeurs et ton parcours.
        </p>

        {recommendationsCount > 0 && (
          <p className="text-sm font-bold mt-4" style={{ color: "var(--hz-braise)" }}>
            {recommendationsCount} personne{recommendationsCount > 1 ? "s" : ""} {recommendationsCount > 1 ? "pourraient" : "pourrait"} t'intéresser aujourd'hui.
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-5">
          <button
            onClick={onDiscover}
            className="bb-btn bb-btn-gold rounded-full px-6 py-3 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Découvrir mes recommandations
          </button>
          {profileCompletePct < 100 && (
            <button
              onClick={onCompleteProfile}
              className="bb-btn rounded-full px-6 py-3 font-bold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ border: "1px solid rgba(98,240,186,.5)", color: "var(--hz-signal)", background: "rgba(98,240,186,.06)" }}
            >
              Compléter mon profil
            </button>
          )}
        </div>
      </div>
    </HorizonStage>
  );
}
