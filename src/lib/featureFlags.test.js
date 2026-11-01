import { describe, it, expect, vi, afterEach } from "vitest";
import { isPremiumEnabled, isAiEnabled, MEMBER_COUNT_PUBLIC_MIN } from "./featureFlags";

afterEach(() => vi.unstubAllEnvs());

describe("featureFlags", () => {
  it("Premium et IA sont désactivés par défaut", () => {
    vi.stubEnv("VITE_FEATURE_PREMIUM", "");
    vi.stubEnv("VITE_FEATURE_AI", "");
    expect(isPremiumEnabled()).toBe(false);
    expect(isAiEnabled()).toBe(false);
  });

  it("s'activent avec « true » ou « 1 » uniquement", () => {
    vi.stubEnv("VITE_FEATURE_PREMIUM", "true");
    vi.stubEnv("VITE_FEATURE_AI", "1");
    expect(isPremiumEnabled()).toBe(true);
    expect(isAiEnabled()).toBe(true);
    vi.stubEnv("VITE_FEATURE_PREMIUM", "yes");
    expect(isPremiumEnabled()).toBe(false);
  });

  it("seuil du compteur public strictement positif", () => {
    expect(MEMBER_COUNT_PUBLIC_MIN).toBeGreaterThan(1);
  });
});
