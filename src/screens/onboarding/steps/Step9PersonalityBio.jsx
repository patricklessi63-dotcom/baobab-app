import React from "react";
import { C, PERSONALITY_EVENING_OPTIONS, PERSONALITY_TRAVEL_OPTIONS, RELATIONSHIP_NEEDS_OPTIONS } from "../../../constants";
import ChipSelect from "../../../components/ChipSelect";
import { truncateUnicodeSafe } from "../../../utils/format";

const BIO_MAX = 300;
const BIO_PROMPTS = ["Qu'est-ce qui te passionne ?", "Qu'aimerais-tu découvrir au Canada ?"];

// Rien n'est obligatoire à cette étape.
export function isStep9Valid() {
  return true;
}

export default function Step9PersonalityBio({ draft, update }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "var(--bb-font-title)", fontWeight: 800, fontSize: 22, color: C.primary }}>
        Un peu de personnalité
      </h2>
      <p className="text-sm" style={{ color: "var(--bb-text-faint)" }}>
        Rien de scientifique — juste pour mieux te connaître.
      </p>

      <p className="text-xs font-semibold mt-1" style={{ color: "var(--bb-text-faint)" }}>Je préfère :</p>
      <ChipSelect options={PERSONALITY_EVENING_OPTIONS} value={draft.personalityEvening} onChange={(v) => update({ personalityEvening: v })} />

      <p className="text-xs font-semibold mt-2" style={{ color: "var(--bb-text-faint)" }}>Quand je voyage :</p>
      <ChipSelect options={PERSONALITY_TRAVEL_OPTIONS} value={draft.personalityTravel} onChange={(v) => update({ personalityTravel: v })} />

      <p className="text-xs font-semibold mt-2" style={{ color: "var(--bb-text-faint)" }}>Pour moi, une bonne relation repose surtout sur (max 2) :</p>
      <ChipSelect options={RELATIONSHIP_NEEDS_OPTIONS} value={draft.relationshipNeeds} onChange={(v) => update({ relationshipNeeds: v })} multi max={2} />

      <p className="text-xs font-semibold mt-3" style={{ color: "var(--bb-text-faint)" }}>Parle-nous de toi</p>
      <textarea
        dir="auto"
        value={draft.bio}
        onChange={(e) => update({ bio: truncateUnicodeSafe(e.target.value, BIO_MAX) })}
        rows={4}
        placeholder="J'aime découvrir de nouvelles villes, cuisiner et rencontrer des personnes positives."
        className="bb-input w-full text-sm"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--bb-text-faint)" }}>
          {BIO_PROMPTS.join(" · ")}
        </p>
        <span className="text-xs shrink-0 ml-2" style={{ color: "var(--bb-text-faint)" }}>{(draft.bio || "").length}/{BIO_MAX}</span>
      </div>
    </div>
  );
}
