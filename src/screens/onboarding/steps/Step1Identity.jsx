import React from "react";
import { C } from "../../../constants";

export function isStep1Valid(draft) {
  if (!draft.name?.trim() || !draft.birthDate) return false;
  const age = computeAge(draft.birthDate);
  return age !== null && age >= 18 && age <= 100;
}

export function computeAge(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export default function Step1Identity({ draft, update }) {
  const age = computeAge(draft.birthDate);
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 18);
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 100);

  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        Qui es-tu ?
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
        Commençons par les bases.
      </p>

      <label className="text-xs font-semibold" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Prénom</label>
      <input
        value={draft.name}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="Ton prénom"
        className="bb-input w-full text-sm"
      />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Nom <span style={{ fontWeight: 400 }}>(facultatif)</span></label>
      <input
        value={draft.lastName}
        onChange={(e) => update({ lastName: e.target.value })}
        placeholder="Ton nom de famille"
        className="bb-input w-full text-sm"
      />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>Date de naissance</label>
      <input
        type="date"
        value={draft.birthDate}
        max={maxDate.toISOString().slice(0, 10)}
        min={minDate.toISOString().slice(0, 10)}
        onChange={(e) => update({ birthDate: e.target.value })}
        className="bb-input w-full text-sm"
      />
      {draft.birthDate && age === null && (
        <p className="text-xs" style={{ color: C.clay }}>Choisis une date de naissance valide.</p>
      )}
      {draft.birthDate && age !== null && age < 18 && (
        <p className="text-xs" style={{ color: C.clay }}>Tu dois avoir au moins 18 ans pour utiliser Baobab.</p>
      )}
      {draft.birthDate && age !== null && age >= 18 && age <= 100 && (
        <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>Âge affiché sur ton profil : {age} ans. Ta date de naissance complète n'est jamais visible publiquement.</p>
      )}
    </div>
  );
}
