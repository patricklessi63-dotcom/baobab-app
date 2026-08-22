import React from "react";
import { C, IMMIGRATION_STATUS_OPTIONS, EDUCATION_LEVELS } from "../../../constants";
import ChipSelect from "../../../components/ChipSelect";

export function isStep4Valid(draft) {
  return Boolean(
    draft.arrivedSince?.trim() && draft.immigrationStatus?.trim() &&
    draft.occupation?.trim() && draft.educationLevel?.trim()
  );
}

// "Depuis combien de temps au Canada" attendait auparavant un texte libre
// (ex. "6 à 12 mois") — remplacé par un champ numérique + un sélecteur
// d'unité (Mois/Années) sur demande explicite : l'utilisateur ne saisit
// que le chiffre. La valeur stockée (draft.arrivedSince) reste une simple
// chaîne texte, inchangée pour le reste de l'app (affichage profil, etc.).
export function parseArrivedSince(str) {
  const m = String(str || "").trim().match(/^(\d+)\s*(mois|ans?|ann[ée]es?)$/i);
  if (!m) return { amount: "", unit: "mois" };
  return { amount: m[1], unit: /an/i.test(m[2]) ? "annees" : "mois" };
}

export function formatArrivedSince(amount, unit) {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n <= 0) return "";
  if (unit === "annees") return `${n} ${n > 1 ? "ans" : "an"}`;
  return `${n} mois`;
}

export default function Step4CanadaJourney({ draft, update }) {
  const { amount, unit } = parseArrivedSince(draft.arrivedSince);

  function setAmount(value) {
    update({ arrivedSince: formatArrivedSince(value, unit) });
  }

  function setUnit(nextUnit) {
    update({ arrivedSince: formatArrivedSince(amount, nextUnit) });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        🇨🇦 Ton parcours au Canada
      </h2>

      <label className="text-xs font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Depuis combien de temps vis-tu au Canada ?</label>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Ex. 6"
          className="bb-input text-sm"
          style={{ width: 100 }}
          aria-label="Nombre"
        />
        <div className="flex gap-2 flex-1">
          <button type="button" onClick={() => setUnit("mois")} aria-pressed={unit === "mois"}
            className={`bb-pill flex-1 text-xs font-semibold px-3.5 py-2.5 rounded-full ${unit === "mois" ? "bb-pill-active" : ""}`}>
            Mois
          </button>
          <button type="button" onClick={() => setUnit("annees")} aria-pressed={unit === "annees"}
            className={`bb-pill flex-1 text-xs font-semibold px-3.5 py-2.5 rounded-full ${unit === "annees" ? "bb-pill-active" : ""}`}>
            Années
          </button>
        </div>
      </div>

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Situation actuelle</label>
      <ChipSelect options={IMMIGRATION_STATUS_OPTIONS} value={draft.immigrationStatus} onChange={(v) => update({ immigrationStatus: v })} />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Profession</label>
      <input value={draft.occupation} onChange={(e) => update({ occupation: e.target.value })} placeholder="Ton métier" className="bb-input w-full text-sm" />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Études</label>
      <ChipSelect options={EDUCATION_LEVELS} value={draft.educationLevel} onChange={(v) => update({ educationLevel: v })} />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Ville d'arrivée au Canada (facultatif)</label>
      <input value={draft.arrivalCity} onChange={(e) => update({ arrivalCity: e.target.value })} placeholder="Si différente de ta ville actuelle" className="bb-input w-full text-sm" />
    </div>
  );
}
