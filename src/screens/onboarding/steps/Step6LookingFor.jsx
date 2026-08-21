import React from "react";
import { C, LOOKING_FOR_OPTIONS, RELATIONSHIP_VALUES_OPTIONS } from "../../../constants";
import ChipSelect from "../../../components/ChipSelect";

function hasIntimateIntent(lookingFor) {
  return (lookingFor || []).some((v) => v.includes("Amour") || v.includes("Relation sérieuse"));
}

export function isStep6Valid(draft) {
  return Array.isArray(draft.lookingFor) && draft.lookingFor.length >= 1;
}

export default function Step6LookingFor({ draft, update }) {
  const showIntentions = hasIntimateIntent(draft.lookingFor);

  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        Qu'est-ce que tu recherches sur Baobab ?
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb-static),0.6)" }}>
        Choisis autant d'options que nécessaire.
      </p>

      <ChipSelect
        options={LOOKING_FOR_OPTIONS}
        value={draft.lookingFor}
        onChange={(v) => update({ lookingFor: v })}
        multi
      />

      {showIntentions && (
        <div className="mt-3 bb-fade-in">
          <p className="text-xs font-semibold mb-1.5" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Quel type de relation souhaites-tu ?</p>
          <ChipSelect
            options={RELATIONSHIP_VALUES_OPTIONS}
            value={draft.relationshipValues}
            onChange={(v) => update({ relationshipValues: v })}
            multi
          />
        </div>
      )}
    </div>
  );
}
