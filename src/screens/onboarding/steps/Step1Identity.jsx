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

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Composé Jour/Mois/Année (item demandé : sélection par année, pas par
// mois — un <select> d'années descend directement à l'année voulue en un
// clic, contrairement au picker natif <input type="date"> qui fait
// défiler mois par mois) + un champ "âge" qui recalcule l'année en
// direct (item demandé : pouvoir saisir son âge soi-même).
export default function Step1Identity({ draft, update }) {
  const age = computeAge(draft.birthDate);
  const thisYear = new Date().getFullYear();
  const minYear = thisYear - 100;
  const maxYear = thisYear - 18;

  const parsed = draft.birthDate ? draft.birthDate.split("-").map(Number) : null;
  const [selYear, selMonth, selDay] = parsed && parsed.length === 3 && !parsed.some(Number.isNaN)
    ? parsed
    : [null, null, null];

  function setDate({ year, month, day }) {
    const y = year ?? selYear;
    const m = month ?? selMonth ?? 1;
    let d = day ?? selDay ?? 1;
    if (!y) { update({ birthDate: "" }); return; }
    // Changer le mois (ou l'année, pour un 29 février) après avoir choisi
    // un jour peut laisser un jour désormais hors bornes (ex. 31 puis
    // Avril) : on l'écrit tel quel dans birthDate sans le reclamper. New
    // Date() du navigateur "digère" silencieusement ce débordement (roule
    // sur le mois suivant) mais la colonne `date` de Postgres le rejette
    // franchement à l'enregistrement — sauvegarde de l'étape en échec avec
    // un message générique, sans lien évident avec la date choisie.
    const maxDay = new Date(y, m, 0).getDate();
    if (d > maxDay) d = maxDay;
    update({ birthDate: `${y}-${pad2(m)}-${pad2(d)}` });
  }

  function handleAgeInput(value) {
    const n = Number(value);
    if (!value || Number.isNaN(n)) return;
    // Approximation volontaire (année seule) — l'utilisateur peut ensuite
    // affiner jour/mois ci-dessous ; on ne lui redemande pas l'âge à
    // chaque ajustement.
    setDate({ year: thisYear - n });
  }

  const years = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);
  const daysInMonth = selMonth ? new Date(selYear || thisYear, selMonth, 0).getDate() : 31;

  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        Qui es-tu ?
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb-static),0.6)" }}>
        Commençons par les bases.
      </p>

      <label className="text-xs font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Prénom</label>
      <input
        value={draft.name}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="Ton prénom"
        className="bb-input w-full text-sm"
      />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Nom <span style={{ fontWeight: 400 }}>(facultatif)</span></label>
      <input
        value={draft.lastName}
        onChange={(e) => update({ lastName: e.target.value })}
        placeholder="Ton nom de famille"
        className="bb-input w-full text-sm"
      />

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Date de naissance</label>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={selYear || ""}
          onChange={(e) => setDate({ year: e.target.value ? Number(e.target.value) : null })}
          className="bb-input w-full text-sm"
          aria-label="Année de naissance"
        >
          <option value="">Année</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={selMonth || ""}
          onChange={(e) => setDate({ month: e.target.value ? Number(e.target.value) : null })}
          disabled={!selYear}
          className="bb-input w-full text-sm"
          aria-label="Mois de naissance"
        >
          <option value="">Mois</option>
          {MONTHS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
        </select>
        <select
          value={selDay || ""}
          onChange={(e) => setDate({ day: e.target.value ? Number(e.target.value) : null })}
          disabled={!selYear}
          className="bb-input w-full text-sm"
          aria-label="Jour de naissance"
        >
          <option value="">Jour</option>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <label className="text-xs font-semibold mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>
        Ou entre directement ton âge
      </label>
      <input
        type="number"
        inputMode="numeric"
        min={18}
        max={100}
        value={age !== null ? age : ""}
        onChange={(e) => handleAgeInput(e.target.value)}
        placeholder="Ex. 28"
        className="bb-input w-full text-sm"
      />

      {draft.birthDate && age === null && (
        <p className="text-xs" style={{ color: C.clay }}>Choisis une date de naissance valide.</p>
      )}
      {draft.birthDate && age !== null && age < 18 && (
        <p className="text-xs" style={{ color: C.clay }}>Tu dois avoir au moins 18 ans pour utiliser Baobab.</p>
      )}
      {draft.birthDate && age !== null && age > 100 && (
        <p className="text-xs" style={{ color: C.clay }}>Vérifie ta date de naissance.</p>
      )}
      {draft.birthDate && age !== null && age >= 18 && age <= 100 && (
        <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>Âge affiché sur ton profil : {age} ans. Ta date de naissance complète n'est jamais visible publiquement.</p>
      )}
    </div>
  );
}
