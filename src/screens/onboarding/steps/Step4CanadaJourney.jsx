import React from "react";
import { C, IMMIGRATION_STATUS_OPTIONS, EDUCATION_LEVELS } from "../../../constants";
import ChipSelect from "../../../components/ChipSelect";

export function isStep4Valid(draft) {
  return Boolean(
    draft.arrivedSince?.trim() && draft.immigrationStatus?.trim() &&
    draft.occupation?.trim() && draft.educationLevel?.trim()
  );
}

export default function Step4CanadaJourney({ draft, update }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        🇨🇦 Ton parcours au Canada
      </h2>

      <label className="text-xs font-semibold" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Depuis combien de temps vis-tu au Canada ?</label>
      <input value={draft.arrivedSince} onChange={(e) => update({ arrivedSince: e.target.value })} placeholder="Ex : 6 à 12 mois" className="bb-input w-full text-sm" />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Situation actuelle</label>
      <ChipSelect options={IMMIGRATION_STATUS_OPTIONS} value={draft.immigrationStatus} onChange={(v) => update({ immigrationStatus: v })} />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Profession</label>
      <input value={draft.occupation} onChange={(e) => update({ occupation: e.target.value })} placeholder="Ton métier" className="bb-input w-full text-sm" />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Études</label>
      <ChipSelect options={EDUCATION_LEVELS} value={draft.educationLevel} onChange={(v) => update({ educationLevel: v })} />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Ville d'arrivée au Canada (facultatif)</label>
      <input value={draft.arrivalCity} onChange={(e) => update({ arrivalCity: e.target.value })} placeholder="Si différente de ta ville actuelle" className="bb-input w-full text-sm" />
    </div>
  );
}
