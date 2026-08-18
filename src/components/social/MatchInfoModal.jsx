import React from "react";
import { X } from "lucide-react";
import { primary, coral, muted, card, bg } from "./theme";
import { MATCH_WEIGHTS } from "../../lib/matching/matchingConfig";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const CATEGORY_LABELS = {
  intentions: "❤️ Vos intentions communes",
  interests: "✨ Vos centres d'intérêt",
  lifeProject: "🌱 Votre projet de vie",
  preferences: "🎯 Tes préférences (âge, distance)",
  languages: "🗣️ Vos langues",
  location: "📍 Votre localisation approximative",
};

export default function MatchInfoModal({ open, onClose }) {
  useEscapeKey(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center p-0 md:p-5"
      style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(5px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Comment est calculée cette compatibilité"
    >
      <div className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-black" style={{ color: primary }}>Comment est calculée cette compatibilité ?</h2>
          <button onClick={onClose} aria-label="Fermer"><X /></button>
        </div>

        <p className="text-sm" style={{ color: "#20243A" }}>
          C'est une estimation basée sur vos profils, pas une garantie ni un
          algorithme d'intelligence artificielle. Baobab compare uniquement
          les informations que tu as choisi de renseigner :
        </p>

        <ul className="mt-4 space-y-2">
          {Object.entries(MATCH_WEIGHTS).map(([key, weight]) => (
            <li key={key} className="flex items-center justify-between text-sm rounded-xl px-3 py-2" style={{ background: bg }}>
              <span>{CATEGORY_LABELS[key]}</span>
              <span className="font-bold" style={{ color: coral }}>{weight}%</span>
            </li>
          ))}
        </ul>

        <p className="text-xs mt-4 leading-5" style={{ color: muted }}>
          Nous n'utilisons jamais l'origine, la religion, l'orientation
          sexuelle, un handicap ou des opinions politiques — Baobab ne
          demande d'ailleurs jamais ces informations. Le calcul reste simple
          et transparent, et le score n'est jamais présenté comme une
          certitude : c'est toujours toi qui décides.
        </p>

        <button onClick={onClose} className="w-full mt-5 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(43,36,32,0.15)", color: "#20243A" }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
