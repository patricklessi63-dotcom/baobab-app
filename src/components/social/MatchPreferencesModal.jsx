import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import ChipSelect from "../ChipSelect";
import { MATCH_DISTANCE_OPTIONS, LOOKING_FOR_OPTIONS } from "../../constants";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, bg, muted, card, primaryRgb } from "./theme";

export default function MatchPreferencesModal({ open, onClose, currentUser, onSave }) {
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(99);
  const [distance, setDistance] = useState("");
  const [lookingFor, setLookingFor] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAgeMin(currentUser?.pref_age_min ?? 18);
    setAgeMax(currentUser?.pref_age_max ?? 99);
    setDistance(currentUser?.pref_distance || "");
    setLookingFor((currentUser?.pref_looking_for || "").split(",").map((s) => s.trim()).filter(Boolean));
    setError("");
  }, [open, currentUser]);

  useEscapeKey(open, onClose);
  if (!open) return null;

  const save = () => {
    const min = Number(ageMin);
    const max = Number(ageMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min < 18 || max > 99 || min > max) {
      setError("Choisis une tranche d'âge valide (18 à 99, minimum ≤ maximum).");
      return;
    }
    onSave({ pref_age_min: min, pref_age_max: max, pref_distance: distance, pref_looking_for: lookingFor.join(", ") });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mes préférences"
    >
      <div className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-black" style={{ color: primary }}>🎯 Mes préférences</h2>
          <button onClick={onClose} aria-label="Fermer"><X /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: muted }}>
          Baobab ne te recommandera que des profils qui respectent ces critères.
        </p>

        <label className="text-xs font-semibold" style={{ color: muted }}>Tranche d'âge</label>
        <div className="flex items-center gap-2 mt-1.5">
          <input
            type="number" min={18} max={99} value={ageMin}
            onChange={(e) => setAgeMin(e.target.value)}
            className="w-full rounded-xl p-3 text-sm outline-none"
            style={{ background: bg }}
            aria-label="Âge minimum"
          />
          <span className="text-sm" style={{ color: muted }}>à</span>
          <input
            type="number" min={18} max={99} value={ageMax}
            onChange={(e) => setAgeMax(e.target.value)}
            className="w-full rounded-xl p-3 text-sm outline-none"
            style={{ background: bg }}
            aria-label="Âge maximum"
          />
        </div>

        <label className="block text-xs font-semibold mt-4" style={{ color: muted }}>Distance</label>
        <div className="mt-1.5">
          <ChipSelect options={MATCH_DISTANCE_OPTIONS} value={distance} onChange={setDistance} />
        </div>

        <label className="block text-xs font-semibold mt-4" style={{ color: muted }}>Ce que la personne recherche</label>
        <p className="text-[11px] mt-0.5 mb-1.5" style={{ color: muted }}>Laisse vide pour ne filtrer sur aucun critère.</p>
        <div className="mt-1.5">
          <ChipSelect options={LOOKING_FOR_OPTIONS} value={lookingFor} onChange={setLookingFor} multi />
        </div>

        {error && <p className="text-xs mt-3" style={{ color: coral }}>{error}</p>}

        <button onClick={save} className="bb-btn-gold w-full mt-5 py-3 rounded-full text-sm font-bold">
          Enregistrer
        </button>
      </div>
    </div>
  );
}
