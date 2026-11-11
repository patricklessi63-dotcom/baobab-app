import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("../../supabaseClient", () => ({ supabase: { rpc: (...a) => rpcMock(...a) } }));

import {
  normalizeStats, isStatsEmpty, weekLabel, statsErrorMessage, loadCreatorStats, STATS_PERIODS, DEFAULT_STATS_PERIOD,
} from "./creatorStats";

beforeEach(() => rpcMock.mockReset());

describe("normalizeStats", () => {
  it("met en forme la réponse du serveur", () => {
    const s = normalizeStats({
      period_days: 30, posts_total: 3, posts_period: 2, likes_total: 5, likes_period: 4,
      comments_total: 1, comments_period: 1, followers_total: 7, followers_period: 2,
      top_posts: [{ id: "p1", excerpt: "Bonjour", created_at: "2026-11-01", likes: 3, comments: 1, score: 4 }],
      weekly: [{ week: "2026-11-02", posts: 1, likes: 2, comments: 0 }],
    });
    expect(s.likes).toEqual({ total: 5, period: 4 });
    expect(s.followers).toEqual({ total: 7, period: 2 });
    expect(s.topPosts[0]).toMatchObject({ id: "p1", excerpt: "Bonjour", likes: 3, comments: 1 });
    expect(s.weekly).toEqual([{ week: "2026-11-02", posts: 1, likes: 2, comments: 0 }]);
  });

  it("ne plante jamais sur une réponse vide ou abîmée : zéros et listes vides", () => {
    for (const raw of [null, undefined, "x", {}, { top_posts: "n", weekly: 3, likes_total: "abc" }]) {
      const s = normalizeStats(raw);
      expect(s.likes.total).toBe(0);
      expect(s.topPosts).toEqual([]);
      expect(s.weekly).toEqual([]);
      expect(s.periodDays).toBe(DEFAULT_STATS_PERIOD);
    }
  });
});

describe("isStatsEmpty", () => {
  it("vrai seulement quand rien n'existe encore", () => {
    expect(isStatsEmpty(normalizeStats({}))).toBe(true);
    expect(isStatsEmpty(normalizeStats({ followers_total: 1 }))).toBe(false);
    expect(isStatsEmpty(normalizeStats({ posts_total: 1 }))).toBe(false);
  });
});

describe("weekLabel", () => {
  it("formate une date ISO sans décalage de fuseau", () => {
    expect(weekLabel("2026-11-02")).toMatch(/2/);
    expect(weekLabel("2026-11-02")).toMatch(/nov/i);
  });
  it("renvoie une chaîne vide pour une valeur invalide", () => {
    expect(weekLabel("")).toBe("");
    expect(weekLabel("pas une date")).toBe("");
    expect(weekLabel(undefined)).toBe("");
  });
});

describe("statsErrorMessage", () => {
  it("reconnaît le refus (droit), la fonction absente, et laisse le reste au message générique", () => {
    expect(statsErrorMessage({ code: "42501", message: "Reserve aux abonnes Premium" })).toMatch(/réservées aux abonnés Premium/);
    expect(statsErrorMessage({ code: "PGRST202", message: "Could not find the function public.my_creator_stats" })).toMatch(/pas encore disponibles/);
    expect(statsErrorMessage({ code: "42883", message: "function does not exist" })).toMatch(/pas encore disponibles/);
    expect(statsErrorMessage({ message: "network down" })).toBeNull();
    expect(statsErrorMessage(null)).toBeNull();
  });
});

describe("loadCreatorStats", () => {
  it("appelle la fonction serveur avec la période, et rien d'autre (pas d'identifiant)", async () => {
    rpcMock.mockResolvedValue({ data: { posts_total: 2 }, error: null });
    const s = await loadCreatorStats(90);
    expect(rpcMock).toHaveBeenCalledWith("my_creator_stats", { p_days: 90 });
    expect(s.posts.total).toBe(2);
  });
  it("propage l'erreur de la base", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "Reserve aux abonnes Premium" } });
    await expect(loadCreatorStats()).rejects.toMatchObject({ code: "42501" });
  });
  it("les périodes proposées correspondent aux bornes serveur (7 à 90)", () => {
    expect(Math.min(...STATS_PERIODS)).toBe(7);
    expect(Math.max(...STATS_PERIODS)).toBe(90);
  });
});
