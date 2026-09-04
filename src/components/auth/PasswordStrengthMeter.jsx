import React from "react";
import { Check } from "lucide-react";
import { scorePassword } from "../../lib/passwordStrength";
import { C } from "./authTheme";

// Couleurs dupliquées en dur ici (bug corrigé à l'audit) alors qu'elles
// existaient déjà comme jetons nommés dans authTheme.js (C.clay/C.ochre/
// C.acacia, eux-mêmes réexportés de constants.js, source unique de
// vérité) — un risque de dérive silencieuse si l'un de ces jetons était un
// jour retouché sans que quiconque pense à répercuter le changement ici.
const BAR_COLORS = [C.clay, C.clay, C.ochre, C.acacia, C.acacia];

// Jauge de force réelle (voir src/lib/passwordStrength.js) + checklist des
// règles qui se coche en temps réel — le caractère spécial reste marqué
// "recommandé", jamais bloquant.
export default function PasswordStrengthMeter({ password }) {
  if (!password) return null;
  const { score, label, checks } = scorePassword(password);
  const barColor = BAR_COLORS[score];

  const items = [
    { ok: checks.length, label: "8 caractères minimum" },
    { ok: checks.upper, label: "1 lettre majuscule" },
    { ok: checks.lower, label: "1 lettre minuscule" },
    { ok: checks.digit, label: "1 chiffre" },
    { ok: checks.special, label: "1 caractère spécial (recommandé)" },
  ];

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-all duration-300"
              style={{ background: i < score ? barColor : "rgba(242,233,220,0.14)" }}
            />
          ))}
        </div>
        <span className="text-[11px] font-bold flex-shrink-0" style={{ color: barColor }}>{label}</span>
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: it.ok ? "#B9D5B2" : C.sandDim }}>
            <span
              className="flex-shrink-0 h-3.5 w-3.5 rounded-full flex items-center justify-center"
              style={{ background: it.ok ? "rgba(143,174,134,0.28)" : "rgba(242,233,220,0.08)" }}
            >
              {it.ok && <Check size={9} strokeWidth={3} />}
            </span>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
