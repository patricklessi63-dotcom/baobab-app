import React from "react";
import { C, WANTS_CHILDREN_OPTIONS, FAMILY_IMPORTANCE_OPTIONS, CAREER_GOAL_OPTIONS, GEOGRAPHIC_OPENNESS_OPTIONS } from "../../../constants";
import ChipSelect from "../../../components/ChipSelect";

// Étape entièrement facultative — toujours valide.
export function isStep7Valid() {
  return true;
}

export default function Step7LifeProject({ draft, update }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        ✨ Ton projet de vie
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
        Tout est facultatif — réponds seulement à ce qui te parle.
      </p>

      <p className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Souhaites-tu avoir des enfants ?</p>
      <ChipSelect options={WANTS_CHILDREN_OPTIONS} value={draft.wantsChildren} onChange={(v) => update({ wantsChildren: v })} />

      <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Importance de la famille</p>
      <ChipSelect options={FAMILY_IMPORTANCE_OPTIONS} value={draft.familyImportance} onChange={(v) => update({ familyImportance: v })} />

      <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Projet professionnel</p>
      <ChipSelect options={CAREER_GOAL_OPTIONS} value={draft.careerGoal} onChange={(v) => update({ careerGoal: v })} />

      <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Projet géographique</p>
      <ChipSelect options={GEOGRAPHIC_OPENNESS_OPTIONS} value={draft.geographicOpenness} onChange={(v) => update({ geographicOpenness: v })} />
    </div>
  );
}
