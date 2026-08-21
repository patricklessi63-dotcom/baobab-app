import React from "react";
import { navy, green, gold } from "../social/theme";

export default function BaobabHero({ recommendationsCount = 0, profileCompletePct = 100, onDiscover, onCompleteProfile }) {
  return (
    <div
      className="bb-fade-in rounded-[30px] p-6 md:p-8 text-white shadow-[0_20px_60px_rgba(20,67,42,.18)] overflow-hidden relative mb-7"
      style={{ background: `linear-gradient(145deg,${navy},#1E4632 55%,${green})` }}
    >
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" aria-hidden="true" />
      <div className="absolute -right-6 -bottom-12 text-[140px] leading-none opacity-10 select-none" aria-hidden="true">🌳</div>

      <div className="relative max-w-2xl">
        <div className="text-[11px] uppercase tracking-[.22em] text-white/55 font-bold">🌳 Mon Baobab</div>
        <h2 className="text-2xl md:text-3xl font-black mt-2 leading-tight">Ton cercle canadien commence ici.</h2>
        <p className="text-sm text-white/70 mt-2 leading-6 max-w-md">
          Découvre des personnes qui partagent tes envies, tes valeurs et ton parcours.
        </p>

        {recommendationsCount > 0 && (
          <p className="text-sm font-bold mt-4" style={{ color: gold }}>
            {recommendationsCount} personne{recommendationsCount > 1 ? "s" : ""} {recommendationsCount > 1 ? "pourraient" : "pourrait"} t'intéresser aujourd'hui.
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-5">
          <button
            onClick={onDiscover}
            className="rounded-xl px-5 py-3 font-bold transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            style={{ background: gold, color: navy }}
          >
            Découvrir mes recommandations
          </button>
          {profileCompletePct < 100 && (
            <button
              onClick={onCompleteProfile}
              className="rounded-xl px-5 py-3 font-bold border border-white/30 text-white transition-colors duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            >
              Compléter mon profil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
