import React from "react";
import { C, INTERESTS_OPTIONS } from "../../../constants";
import ChipSelect from "../../../components/ChipSelect";

const MIN_INTERESTS = 5;
const MAX_INTERESTS = 10;

export function isStep8Valid(draft) {
  return Array.isArray(draft.interests) && draft.interests.length >= MIN_INTERESTS;
}

export default function Step8Interests({ draft, update }) {
  const count = (draft.interests || []).length;
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        Tes centres d'intérêt
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb-static),0.6)" }}>
        Choisis entre {MIN_INTERESTS} et {MAX_INTERESTS} intérêts ({count}/{MAX_INTERESTS}).
      </p>

      <ChipSelect
        options={INTERESTS_OPTIONS}
        value={draft.interests}
        onChange={(v) => update({ interests: v })}
        multi
        max={MAX_INTERESTS}
      />
    </div>
  );
}
