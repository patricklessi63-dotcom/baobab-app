import { describe, it, expect } from "vitest";
import { checkRateLimit, MESSAGE_RATE_LIMIT } from "./messageRateLimit.js";

const { maxMessages, windowMs } = MESSAGE_RATE_LIMIT;

describe("checkRateLimit", () => {
  const NOW = 1_000_000;

  it("seuil de config : 8 messages / 15 s", () => {
    expect(maxMessages).toBe(8);
    expect(windowMs).toBe(15000);
  });

  it("aucun message récent -> autorisé, liste vide", () => {
    expect(checkRateLimit([], NOW)).toEqual({ allowed: true, remainingTimestamps: [] });
  });

  it("écarte les timestamps hors de la fenêtre glissante", () => {
    const stamps = [NOW - windowMs - 1, NOW - windowMs, NOW - 5000, NOW - 100];
    const res = checkRateLimit(stamps, NOW);
    // > cutoff strict : NOW - windowMs est exclu (t > cutoff)
    expect(res.remainingTimestamps).toEqual([NOW - 5000, NOW - 100]);
    expect(res.allowed).toBe(true);
  });

  it("juste sous le seuil (7 dans la fenêtre) -> encore autorisé", () => {
    const stamps = Array.from({ length: maxMessages - 1 }, (_, i) => NOW - i * 100);
    expect(checkRateLimit(stamps, NOW).allowed).toBe(true);
  });

  it("exactement au seuil (8 dans la fenêtre) -> bloqué", () => {
    const stamps = Array.from({ length: maxMessages }, (_, i) => NOW - i * 100);
    const res = checkRateLimit(stamps, NOW);
    expect(res.remainingTimestamps).toHaveLength(maxMessages);
    expect(res.allowed).toBe(false);
  });

  it("au-dessus du seuil -> bloqué", () => {
    const stamps = Array.from({ length: maxMessages + 5 }, (_, i) => NOW - i * 100);
    expect(checkRateLimit(stamps, NOW).allowed).toBe(false);
  });

  it("des timestamps anciens qui sortent de la fenêtre débloquent l'envoi", () => {
    const old = Array.from({ length: maxMessages }, (_, i) => NOW - windowMs - 1 - i);
    const res = checkRateLimit(old, NOW);
    expect(res.remainingTimestamps).toEqual([]);
    expect(res.allowed).toBe(true);
  });

  it("utilise Date.now() par défaut quand `now` n'est pas fourni", () => {
    const res = checkRateLimit([Date.now() - 1000]);
    expect(res.allowed).toBe(true);
    expect(res.remainingTimestamps).toHaveLength(1);
  });

  it("ne mute pas le tableau d'entrée", () => {
    const stamps = [NOW - 100_000, NOW - 100];
    const copy = [...stamps];
    checkRateLimit(stamps, NOW);
    expect(stamps).toEqual(copy);
  });
});
