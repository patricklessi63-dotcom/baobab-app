import React from "react";
import { C, LANGUAGES_OPTIONS, LANGUAGE_LEVELS } from "../../../constants";

export function isStep5Valid(draft) {
  return Array.isArray(draft.languagesDetail) && draft.languagesDetail.length >= 1;
}

export default function Step5Languages({ draft, update }) {
  const list = draft.languagesDetail || [];

  const toggleLanguage = (language) => {
    const exists = list.find((l) => l.language === language);
    if (exists) {
      update({ languagesDetail: list.filter((l) => l.language !== language) });
    } else {
      update({ languagesDetail: [...list, { language, level: LANGUAGE_LEVELS[3] }] });
    }
  };

  const setLevel = (language, level) => {
    update({ languagesDetail: list.map((l) => (l.language === language ? { ...l, level } : l)) });
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        🗣️ Tes langues
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
        Sélectionne les langues que tu parles.
      </p>

      <div className="flex gap-2 flex-wrap">
        {LANGUAGES_OPTIONS.map((lang) => {
          const active = list.some((l) => l.language === lang);
          return (
            <button
              type="button"
              key={lang}
              onClick={() => toggleLanguage(lang)}
              aria-pressed={active}
              className={`bb-pill text-xs font-semibold px-3.5 py-2.5 rounded-full ${active ? "bb-pill-active" : ""}`}
            >
              {lang}
            </button>
          );
        })}
      </div>

      {list.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          {list.map(({ language, level }) => (
            <div key={language} className="flex items-center justify-between gap-2 p-2.5 rounded-xl" style={{ background: "rgba(var(--bb-ink-rgb),0.03)" }}>
              <span className="text-sm font-semibold">{language}</span>
              <select
                value={level}
                onChange={(e) => setLevel(language, e.target.value)}
                className="text-xs rounded-full px-2.5 py-1.5"
                style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.16)", background: "#fff", color: C.indigo }}
              >
                {LANGUAGE_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>{lv}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
