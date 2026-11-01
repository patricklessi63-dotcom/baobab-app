import React from "react";
import { C } from "../../../constants";

export function isStep3Valid(draft) {
  return Boolean(draft.country?.trim() && draft.province?.trim() && draft.city?.trim());
}

export default function Step3Location({ draft, update }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "var(--bb-font-title)", fontWeight: 800, fontSize: 22, color: C.primary }}>
        Où es-tu ?
      </h2>
      <p className="text-sm" style={{ color: "var(--bb-text-faint)" }}>
        Seule ta ville sera visible publiquement — jamais une adresse exacte.
      </p>

      <label className="text-xs font-semibold" style={{ color: "var(--bb-text-faint)" }}>Pays d'origine</label>
      <input value={draft.country} onChange={(e) => update({ country: e.target.value })} placeholder="Ex : Sénégal, Philippines, Haïti…" maxLength={80} className="bb-input w-full text-sm" />

      <label className="text-xs font-semibold mt-1" style={{ color: "var(--bb-text-faint)" }}>Province</label>
      <input value={draft.province} onChange={(e) => update({ province: e.target.value })} placeholder="Ex : Québec" maxLength={80} className="bb-input w-full text-sm" />

      <label className="text-xs font-semibold mt-1" style={{ color: "var(--bb-text-faint)" }}>Ville (Canada)</label>
      <input value={draft.city} onChange={(e) => update({ city: e.target.value })} placeholder="Ex : Montréal" maxLength={80} className="bb-input w-full text-sm" />
    </div>
  );
}
