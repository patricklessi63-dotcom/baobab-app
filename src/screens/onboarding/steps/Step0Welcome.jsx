import React from "react";
import { C, USAGE_GOAL_OPTIONS } from "../../../constants";
import ChipSelect from "../../../components/ChipSelect";

export function isStep0Valid(draft) {
  return Array.isArray(draft.usageGoals) && draft.usageGoals.length >= 1;
}

export default function Step0Welcome({ draft, update }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 24, color: C.indigo }}>
        Bienvenue sur Baobab 🌍
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
        L'espace pour rencontrer des personnes, rejoindre des communautés et
        vivre des expériences ensemble.
      </p>

      <div className="rounded-2xl px-4 py-3 text-xs leading-5" style={{ background: "rgba(217,164,65,0.12)", border: "1px solid rgba(217,164,65,0.28)", color: "rgba(var(--bb-ink-rgb),0.75)" }}>
        <b>Tu fais partie des tout premiers testeurs de Baobab.</b> Ton compte
        et ce que tu vois ici sont réels — merci d'explorer librement et de
        nous signaler tout bug ou idée via « Un souci, une idée ? » dans le
        menu, une fois connecté.
      </div>

      <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.55)" }}>
        Qu'est-ce que tu recherches ? Choisis autant d'options que nécessaire.
      </p>
      <ChipSelect
        options={USAGE_GOAL_OPTIONS}
        value={draft.usageGoals}
        onChange={(v) => update({ usageGoals: v })}
        multi
      />
    </div>
  );
}
