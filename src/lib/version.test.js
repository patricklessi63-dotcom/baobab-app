import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  compareVersions,
  wasRecentlyDismissed,
  dismissUpdate,
  CHECK_INTERVAL_MS,
} from "./version.js";

describe("compareVersions", () => {
  it("égalité -> 0", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("signe négatif si a < b, positif si a > b", () => {
    expect(compareVersions("1.2.3", "1.3.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0); // comparaison numérique, pas lexicale
  });

  it("compare major puis minor puis patch", () => {
    expect(compareVersions("1.5.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("1.2.9", "1.2.10")).toBeLessThan(0);
  });

  it("composants manquants traités comme 0", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBeLessThan(0);
  });

  it("segments non numériques traités comme 0 (comportement réel)", () => {
    expect(compareVersions("v1.2.3", "0.2.3")).toBe(0);
    expect(compareVersions("abc", "0.0.0")).toBe(0);
  });

  it("CHECK_INTERVAL_MS = 30 min", () => {
    expect(CHECK_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});

describe("wasRecentlyDismissed / dismissUpdate", () => {
  let store;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("false si jamais rejeté", () => {
    expect(wasRecentlyDismissed("1.2.3")).toBe(false);
  });

  it("true juste après un dismiss, sur la même version", () => {
    dismissUpdate("1.2.3");
    expect(wasRecentlyDismissed("1.2.3")).toBe(true);
  });

  it("cooldown par version : une autre version cible redemande", () => {
    dismissUpdate("1.2.3");
    expect(wasRecentlyDismissed("1.2.4")).toBe(false);
  });

  it("le cooldown expire après 24h", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    dismissUpdate("1.2.3");
    vi.setSystemTime(new Date("2025-01-01T23:59:00Z"));
    expect(wasRecentlyDismissed("1.2.3")).toBe(true);
    vi.setSystemTime(new Date("2025-01-02T00:01:00Z"));
    expect(wasRecentlyDismissed("1.2.3")).toBe(false);
  });

  it("valeur corrompue en storage -> false, sans lever", () => {
    store.set("baobab:updateDismissedAt:1.2.3", "pas-un-nombre");
    expect(wasRecentlyDismissed("1.2.3")).toBe(false);
  });

  it("localStorage indisponible -> false / no-op silencieux", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(wasRecentlyDismissed("1.2.3")).toBe(false);
    expect(() => dismissUpdate("1.2.3")).not.toThrow();
  });
});
