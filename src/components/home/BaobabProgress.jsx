import React from "react";
import { gold, green, muted, primary, primaryRgb } from "../social/theme";

// Progression basée uniquement sur des donnees reelles et calculables :
// completude du profil + engagement (voir profileCompletionChecks dans
// SocialShell.jsx). Aucune etape future (premier evenement, etc.) n'est
// affichee tant qu'aucune donnee reelle ne permet de la calculer.
export default function BaobabProgress({ stageLabel, stageEmoji, percent, completedSteps, totalSteps }) {
  return (
    <div>
      <div className="text-lg font-black flex items-center gap-2" style={{ color: primary }}>
        {stageLabel} <span aria-hidden="true">{stageEmoji}</span>
      </div>
      <div
        className="mt-3 h-2.5 rounded-full overflow-hidden max-w-sm"
        style={{ background: `rgba(${primaryRgb},.08)` }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression de ton profil Baobab"
      >
        <div
          className="h-full rounded-full transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${percent}%`, background: `linear-gradient(90deg,${gold},${green})` }}
        />
      </div>
      <div className="text-xs mt-2" style={{ color: muted }}>{completedSteps}/{totalSteps} étapes complétées · {percent}%</div>
    </div>
  );
}
