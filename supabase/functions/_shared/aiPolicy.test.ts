import { describe, it, expect } from "vitest";
import {
  DEFAULT_AI_LIMITS,
  MAX_AI_INPUT_CHARS,
  PREMIUM_AI_ACTIONS,
  clampText,
  decideAiAccess,
  isPremiumAiAction,
  parseAiLimits,
  type AiLimits,
} from "./aiPolicy";

const limits: AiLimits = { burstPerHour: 20, freePerDay: 10, premiumPerDay: 100, monthlyGlobalCap: 1000 };
const base = { action: "improve_post", isPremium: false, usedLastHour: 0, usedLast24h: 0, usedThisMonthGlobal: 0, limits };

describe("decideAiAccess — droit Premium", () => {
  it("refuse un outil réservé à Premium à un compte gratuit, quel que soit son quota", () => {
    for (const action of PREMIUM_AI_ACTIONS) {
      const d = decideAiAccess({ ...base, action });
      expect(d).toMatchObject({ ok: false, status: 403, code: "premium_required" });
    }
  });

  it("accepte ces outils pour un abonné", () => {
    for (const action of PREMIUM_AI_ACTIONS) expect(decideAiAccess({ ...base, action, isPremium: true })).toEqual({ ok: true });
  });

  it("les actions existantes restent ouvertes aux comptes gratuits", () => {
    for (const action of ["improve_bio", "improve_post", "translate_message", "suggest_conversation"]) {
      expect(isPremiumAiAction(action)).toBe(false);
      expect(decideAiAccess({ ...base, action })).toEqual({ ok: true });
    }
  });

  it("le refus de droit passe avant les compteurs (pas de fuite d'information sur le quota)", () => {
    const d = decideAiAccess({ ...base, action: "draft_post", usedLast24h: 999, usedLastHour: 999 });
    expect(d).toMatchObject({ code: "premium_required" });
  });
});

describe("decideAiAccess — quotas", () => {
  it("quota quotidien gratuit : 10, le 10e appel déjà consommé bloque", () => {
    expect(decideAiAccess({ ...base, usedLast24h: 9 })).toEqual({ ok: true });
    const d = decideAiAccess({ ...base, usedLast24h: 10 });
    expect(d).toMatchObject({ ok: false, status: 429, code: "daily_limit" });
    expect((d as { message: string }).message).toMatch(/10 suggestions IA gratuites/);
  });

  it("quota quotidien Premium plus large, avec un message sans promotion", () => {
    expect(decideAiAccess({ ...base, isPremium: true, usedLast24h: 99 })).toEqual({ ok: true });
    const d = decideAiAccess({ ...base, isPremium: true, usedLast24h: 100 });
    expect(d).toMatchObject({ code: "daily_limit" });
    expect((d as { message: string }).message).not.toMatch(/premium/i);
  });

  it("la rafale horaire s'applique aussi à Premium", () => {
    const d = decideAiAccess({ ...base, isPremium: true, usedLastHour: 20 });
    expect(d).toMatchObject({ ok: false, status: 429, code: "hourly_limit" });
  });

  it("plafond mensuel global : service en pause pour tout le monde, Premium compris", () => {
    for (const isPremium of [false, true]) {
      const d = decideAiAccess({ ...base, isPremium, usedThisMonthGlobal: 1000 });
      expect(d).toMatchObject({ ok: false, status: 503, code: "service_paused" });
    }
    expect(decideAiAccess({ ...base, usedThisMonthGlobal: 999 })).toEqual({ ok: true });
  });
});

describe("parseAiLimits", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];

  it("valeurs par défaut sans configuration", () => {
    expect(parseAiLimits(env({}))).toEqual(DEFAULT_AI_LIMITS);
  });

  it("lit les surcharges valides", () => {
    expect(parseAiLimits(env({ AI_FREE_PER_DAY: "5", AI_PREMIUM_PER_DAY: "250", AI_RATE_LIMIT_PER_HOUR: "8", AI_MONTHLY_GLOBAL_CAP: "500" })))
      .toEqual({ freePerDay: 5, premiumPerDay: 250, burstPerHour: 8, monthlyGlobalCap: 500 });
  });

  it("une valeur 0, négative, décimale ou illisible retombe sur le défaut (jamais « illimité »)", () => {
    for (const bad of ["0", "-3", "2.5", "abc", "", "Infinity"]) {
      expect(parseAiLimits(env({ AI_FREE_PER_DAY: bad })).freePerDay).toBe(DEFAULT_AI_LIMITS.freePerDay);
    }
  });
});

describe("clampText", () => {
  it("coupe à la longueur maximale et ignore ce qui n'est pas du texte", () => {
    expect(clampText("a".repeat(MAX_AI_INPUT_CHARS + 500))).toHaveLength(MAX_AI_INPUT_CHARS);
    expect(clampText("abc", 2)).toBe("ab");
    for (const bad of [null, undefined, 42, {}, ["x"]]) expect(clampText(bad)).toBe("");
  });
});
