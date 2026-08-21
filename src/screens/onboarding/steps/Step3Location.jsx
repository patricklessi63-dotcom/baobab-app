import React from "react";
import { C } from "../../../constants";

export function isStep3Valid(draft) {
  return Boolean(draft.country?.trim() && draft.province?.trim() && draft.city?.trim());
}

export default function Step3Location({ draft, update }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        Où es-tu ?
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb-static),0.6)" }}>
        Seule ta ville sera visible publiquement — jamais une adresse exacte.
      </p>

      <label className="text-xs font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Pays d'origine</label>
      <input value={draft.country} onChange={(e) => update({ country: e.target.value })} placeholder="Ex : Cameroun" className="bb-input w-full text-sm" />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Province</label>
      <input value={draft.province} onChange={(e) => update({ province: e.target.value })} placeholder="Ex : Québec" className="bb-input w-full text-sm" />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Ville (Canada)</label>
      <input value={draft.city} onChange={(e) => update({ city: e.target.value })} placeholder="Ex : Montréal" className="bb-input w-full text-sm" />
    </div>
  );
}
