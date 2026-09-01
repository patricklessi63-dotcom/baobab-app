import React from "react";
import ChipSelect from "../ChipSelect";
import { EVENT_CATEGORIES } from "../../lib/events/eventConfig";
import { muted, bg } from "./theme";

const DATE_RANGES = [
  { value: "today", label: "Aujourd'hui" },
  { value: "week", label: "Cette semaine" },
  { value: "weekend", label: "Ce week-end" },
  { value: "month", label: "Ce mois-ci" },
];

export default function EventFilters({ city, setCity, category, setCategory, dateRange, setDateRange }) {
  const hasActiveFilters = city || category || dateRange;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="📍 Filtrer par ville..."
          aria-label="Filtrer par ville"
          className="flex-1 text-sm rounded-xl px-3.5 py-2.5 outline-none"
          style={{ background: bg }}
        />
        {hasActiveFilters && (
          <button onClick={() => { setCity(""); setCategory(""); setDateRange(""); }} className="text-xs font-bold px-3 py-2.5 rounded-xl flex-shrink-0" style={{ color: muted }}>
            Réinitialiser
          </button>
        )}
      </div>

      <div>
        <div className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: muted }}>Quand</div>
        <ChipSelect
          options={DATE_RANGES.map((d) => d.label)}
          value={dateRange ? DATE_RANGES.find((d) => d.value === dateRange)?.label : ""}
          onChange={(label) => setDateRange(DATE_RANGES.find((d) => d.label === label)?.value || "")}
        />
      </div>

      <div>
        <div className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: muted }}>Catégorie</div>
        <ChipSelect
          options={EVENT_CATEGORIES.map((c) => `${c.icon} ${c.label}`)}
          value={category ? `${EVENT_CATEGORIES.find((c) => c.value === category)?.icon} ${EVENT_CATEGORIES.find((c) => c.value === category)?.label}` : ""}
          onChange={(label) => {
            const found = EVENT_CATEGORIES.find((c) => `${c.icon} ${c.label}` === label);
            setCategory(found ? found.value : "");
          }}
        />
      </div>
    </div>
  );
}

export function dateRangeBounds(range) {
  const now = new Date();
  const start = new Date(now);
  let end;
  if (range === "today") {
    end = new Date(start); end.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    // "% 7" est indispensable (comme pour "weekend" juste en dessous) : un
    // dimanche, end.getDay() vaut 0, donc "7 - 0 = 7" repoussait la borne de
    // fin sept jours trop loin (au dimanche suivant) au lieu de garder la
    // fin de journée du jour même, incluant à tort toute la semaine d'après
    // dans le filtre "Cette semaine".
    end = new Date(start); end.setDate(end.getDate() + ((7 - end.getDay()) % 7)); end.setHours(23, 59, 59, 999);
  } else if (range === "weekend") {
    const day = start.getDay();
    const toSaturday = (6 - day + 7) % 7;
    start.setDate(start.getDate() + toSaturday);
    end = new Date(start); end.setDate(end.getDate() + 1); end.setHours(23, 59, 59, 999);
  } else if (range === "month") {
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    return null;
  }
  return { start: now.toISOString(), end: end.toISOString() };
}
