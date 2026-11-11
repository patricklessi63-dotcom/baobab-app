// Politique d'accès et de coût de l'Edge Function ai-assist, sans aucune dépendance Deno :
// fonctions pures, testées par Vitest (aiPolicy.test.ts). L'Edge Function lit les compteurs
// dans la table ai_usage puis appelle decideAiAccess() ; rien ici ne fait confiance au client.
//
// Trois protections distinctes, appliquées dans cet ordre :
//  1. Droit : les actions réservées à Premium (PREMIUM_AI_ACTIONS) exigent un abonnement actif,
//     vérifié par la base (has_premium_feature), jamais par un indicateur envoyé par le client.
//  2. Coût global : plafond mensuel d'appels pour TOUTE la plateforme, pour qu'un pic d'usage ou un
//     abus ne puisse pas vider le budget Anthropic. Atteint : le service se met en pause pour tous.
//  3. Équité par personne : rafale (par heure) puis quota quotidien, plus large pour Premium.

export const PREMIUM_AI_ACTIONS = ["correct_text", "draft_post"] as const;

export type AiLimits = {
  burstPerHour: number;
  freePerDay: number;
  premiumPerDay: number;
  monthlyGlobalCap: number;
};

export const DEFAULT_AI_LIMITS: AiLimits = {
  burstPerHour: 20,
  freePerDay: 10,
  premiumPerDay: 100,
  monthlyGlobalCap: 20000,
};

// Longueur maximale d'un texte envoyé à un modèle (coût et abus) ; au-delà, on coupe.
export const MAX_AI_INPUT_CHARS = 2000;

export function isPremiumAiAction(action: string): boolean {
  return (PREMIUM_AI_ACTIONS as readonly string[]).includes(action);
}

// Entier strictement positif lu dans l'environnement ; toute valeur absente, non numérique,
// nulle ou négative retombe sur la valeur par défaut (jamais « 0 = illimité » par accident).
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseAiLimits(get: (name: string) => string | undefined): AiLimits {
  return {
    burstPerHour: positiveInt(get("AI_RATE_LIMIT_PER_HOUR"), DEFAULT_AI_LIMITS.burstPerHour),
    freePerDay: positiveInt(get("AI_FREE_PER_DAY"), DEFAULT_AI_LIMITS.freePerDay),
    premiumPerDay: positiveInt(get("AI_PREMIUM_PER_DAY"), DEFAULT_AI_LIMITS.premiumPerDay),
    monthlyGlobalCap: positiveInt(get("AI_MONTHLY_GLOBAL_CAP"), DEFAULT_AI_LIMITS.monthlyGlobalCap),
  };
}

export function clampText(value: unknown, max: number = MAX_AI_INPUT_CHARS): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export type AiDecision =
  | { ok: true }
  | { ok: false; status: number; code: "premium_required" | "service_paused" | "hourly_limit" | "daily_limit"; message: string };

export function decideAiAccess(input: {
  action: string;
  isPremium: boolean;
  usedLastHour: number;
  usedLast24h: number;
  usedThisMonthGlobal: number;
  limits: AiLimits;
}): AiDecision {
  const { action, isPremium, usedLastHour, usedLast24h, usedThisMonthGlobal, limits } = input;

  if (isPremiumAiAction(action) && !isPremium) {
    return { ok: false, status: 403, code: "premium_required", message: "Cet outil est réservé aux abonnés Baobab Premium." };
  }
  if (usedThisMonthGlobal >= limits.monthlyGlobalCap) {
    return { ok: false, status: 503, code: "service_paused", message: "Les suggestions IA sont momentanément indisponibles. Réessaie plus tard." };
  }
  if (usedLastHour >= limits.burstPerHour) {
    return { ok: false, status: 429, code: "hourly_limit", message: "Limite de suggestions IA atteinte pour cette heure. Réessaie plus tard." };
  }
  const dailyLimit = isPremium ? limits.premiumPerDay : limits.freePerDay;
  if (usedLast24h >= dailyLimit) {
    return {
      ok: false,
      status: 429,
      code: "daily_limit",
      message: isPremium
        ? `Tu as utilisé tes ${dailyLimit} suggestions IA des dernières 24 h. Réessaie plus tard.`
        : `Tu as utilisé tes ${dailyLimit} suggestions IA gratuites des dernières 24 h. Réessaie plus tard, ou découvre Premium pour en avoir davantage.`,
    };
  }
  return { ok: true };
}
