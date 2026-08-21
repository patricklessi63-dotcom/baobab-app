import React from "react";
import { C, ONBOARDING_STEP_COUNT } from "../../constants";

export default function OnboardingProgress({ step }) {
  const pct = Math.round((step / ONBOARDING_STEP_COUNT) * 100);
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>
          Étape {step} sur {ONBOARDING_STEP_COUNT}
        </span>
        <span className="text-xs font-bold" style={{ color: C.indigo }}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full rounded-full overflow-hidden"
        style={{ height: 6, background: "rgba(var(--bb-ink-rgb-static),0.08)" }}
      >
        <div
          className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${C.ochre}, ${C.clay})` }}
        />
      </div>
    </div>
  );
}
