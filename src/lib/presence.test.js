import { describe, it, expect, vi, afterEach } from "vitest";
import { isUserOnline, ONLINE_STALE_MS } from "./presence";

describe("isUserOnline", () => {
  afterEach(() => vi.useRealTimers());

  it("false si le profil est absent", () => {
    expect(isUserOnline(null)).toBe(false);
    expect(isUserOnline(undefined)).toBe(false);
  });

  it("false si is_online est faux, peu importe last_seen", () => {
    expect(isUserOnline({ is_online: false, last_seen: new Date().toISOString() })).toBe(false);
  });

  it("false si is_online est vrai mais last_seen absent", () => {
    expect(isUserOnline({ is_online: true, last_seen: null })).toBe(false);
  });

  it("vrai si is_online et last_seen très récent (heartbeat normal, 30s)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-15T12:00:00.000Z");
    vi.setSystemTime(now);
    const lastSeen = new Date(now.getTime() - 30_000).toISOString(); // 30s avant
    expect(isUserOnline({ is_online: true, last_seen: lastSeen })).toBe(true);
  });

  it("vrai juste avant le seuil de 10 minutes", () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-15T12:00:00.000Z");
    vi.setSystemTime(now);
    const lastSeen = new Date(now.getTime() - (ONLINE_STALE_MS - 1000)).toISOString();
    expect(isUserOnline({ is_online: true, last_seen: lastSeen })).toBe(true);
  });

  it("faux à/après le seuil de 10 minutes — bug corrigé : is_online resté bloqué à true après un crash/coupure réseau (aucun visibilitychange déclenché pour le remettre à false)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-15T12:00:00.000Z");
    vi.setSystemTime(now);
    const lastSeen = new Date(now.getTime() - ONLINE_STALE_MS).toISOString();
    expect(isUserOnline({ is_online: true, last_seen: lastSeen })).toBe(false);

    const wayOld = new Date(now.getTime() - ONLINE_STALE_MS * 10).toISOString();
    expect(isUserOnline({ is_online: true, last_seen: wayOld })).toBe(false);
  });
});
