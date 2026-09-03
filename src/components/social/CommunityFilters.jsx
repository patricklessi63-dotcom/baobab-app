import React from "react";
import ChipSelect from "../ChipSelect";
import { COMMUNITY_CATEGORIES, COMMUNITY_VISIBILITY } from "../../lib/communities/communityConfig";
import { primary, muted, bg } from "./theme";

export default function CommunityFilters({ city, setCity, category, setCategory, visibility, setVisibility }) {
  const hasActiveFilters = city || category || visibility;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="📍 Filtrer par ville..."
          aria-label="Filtrer par ville"
          className="flex-1 text-sm rounded-xl px-3.5 py-2.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]"
          style={{ background: bg }}
        />
        {hasActiveFilters && (
          <button
            onClick={() => { setCity(""); setCategory(""); setVisibility(""); }}
            className="text-xs font-bold px-3 py-2.5 rounded-xl flex-shrink-0"
            style={{ color: muted }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div>
        <div className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: muted }}>Catégorie</div>
        <ChipSelect
          options={COMMUNITY_CATEGORIES.map((c) => `${c.icon} ${c.label}`)}
          value={category ? `${COMMUNITY_CATEGORIES.find((c) => c.value === category)?.icon} ${COMMUNITY_CATEGORIES.find((c) => c.value === category)?.label}` : ""}
          onChange={(label) => {
            const found = COMMUNITY_CATEGORIES.find((c) => `${c.icon} ${c.label}` === label);
            setCategory(found ? found.value : "");
          }}
        />
      </div>

      <div>
        <div className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: muted }}>Type</div>
        <ChipSelect
          options={COMMUNITY_VISIBILITY.map((v) => v.label)}
          value={visibility ? COMMUNITY_VISIBILITY.find((v) => v.value === visibility)?.label : ""}
          onChange={(label) => {
            const found = COMMUNITY_VISIBILITY.find((v) => v.label === label);
            setVisibility(found ? found.value : "");
          }}
        />
      </div>
    </div>
  );
}
