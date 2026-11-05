import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FEED_FILTERS, isFeedFilter, readStoredFilter, storeFilter, popularityScore, rankPopular, popularSinceIso, applyFeedFilter, POPULAR_WINDOW_DAYS,
} from "./feedFilters.js";

describe("filtres du fil", () => {
  it("quatre filtres : Tout, Abonnements, Populaires, Photos et vidéos", () => {
    expect(FEED_FILTERS.map(([, l]) => l)).toEqual(["Tout", "Abonnements", "Populaires", "Photos et vidéos"]);
    expect(isFeedFilter("popular")).toBe(true);
    expect(isFeedFilter("communautes")).toBe(false);
  });

  describe("mémorisation du choix", () => {
    beforeEach(() => { window.localStorage.clear(); });
    it("relit le dernier choix valide, « Tout » sinon", () => {
      expect(readStoredFilter()).toBe("all");
      storeFilter("media");
      expect(readStoredFilter()).toBe("media");
      window.localStorage.setItem("bb.feedFilter", "n'importe quoi");
      expect(readStoredFilter()).toBe("all");
    });
    it("stockage indisponible : jamais d'exception", () => {
      const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqué"); });
      const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqué"); });
      expect(readStoredFilter()).toBe("all");
      expect(() => storeFilter("media")).not.toThrow();
      get.mockRestore(); set.mockRestore();
    });
  });

  describe("populaires", () => {
    it("un commentaire vaut deux réactions", () => {
      expect(popularityScore(3, 0)).toBe(3);
      expect(popularityScore(0, 2)).toBe(4);
      expect(popularityScore(undefined, undefined)).toBe(0);
    });
    it("classe par score puis par date ; ignore les publications sans interaction ; limite la liste", () => {
      const posts = [
        { id: "a", created_at: "2026-11-01T10:00:00Z" },
        { id: "b", created_at: "2026-11-02T10:00:00Z" },
        { id: "c", created_at: "2026-11-03T10:00:00Z" },
        { id: "d", created_at: "2026-11-04T10:00:00Z" },
      ];
      const reactions = { a: 5, b: 1, c: 5, d: 0 };
      const comments = { b: 3 };
      // a=5 ; b=1+6=7 ; c=5 ; d=0 (écarté) -> b, puis c (plus récente que a à égalité), puis a
      expect(rankPopular(posts, reactions, comments).map((p) => p.id)).toEqual(["b", "c", "a"]);
      expect(rankPopular(posts, reactions, comments, 2).map((p) => p.id)).toEqual(["b", "c"]);
      expect(rankPopular(posts, {}, {})).toEqual([]);
    });
    it("fenêtre de 7 jours", () => {
      const now = Date.parse("2026-11-10T12:00:00Z");
      expect(popularSinceIso(now)).toBe(new Date(now - POPULAR_WINDOW_DAYS * 86400000).toISOString());
      expect(popularSinceIso(now)).toBe("2026-11-03T12:00:00.000Z");
    });
  });

  describe("applyFeedFilter", () => {
    const fake = () => {
      const calls = [];
      const q = {};
      ["in", "or", "gte"].forEach((m) => { q[m] = (...a) => { calls.push([m, ...a]); return q; }; });
      return { q, calls };
    };
    it("Tout : requête inchangée", () => {
      const { q, calls } = fake();
      expect(applyFeedFilter(q, "all")).toEqual({ query: q, empty: false });
      expect(calls).toEqual([]);
    });
    it("Abonnements : auteurs suivis ; aucun abonnement = liste vide sans requête inutile", () => {
      const { q, calls } = fake();
      applyFeedFilter(q, "following", { followingIds: ["u1", "u2"] });
      expect(calls).toEqual([["in", "author_id", ["u1", "u2"]]]);
      expect(applyFeedFilter(q, "following", { followingIds: [] }).empty).toBe(true);
      expect(applyFeedFilter(q, "following", {}).empty).toBe(true);
    });
    it("Photos et vidéos : ids avec média OU ancien media_url ; sans id, ancien champ seul", () => {
      const a = fake();
      applyFeedFilter(a.q, "media", { mediaPostIds: ["p1", "p2", null] });
      expect(a.calls).toEqual([["or", "id.in.(p1,p2),media_url.not.is.null"]]);
      const b = fake();
      applyFeedFilter(b.q, "media", {});
      expect(b.calls).toEqual([["or", "media_url.not.is.null"]]);
    });
    it("Populaires : limite aux 7 derniers jours", () => {
      const { q, calls } = fake();
      applyFeedFilter(q, "popular");
      expect(calls[0][0]).toBe("gte");
      expect(calls[0][1]).toBe("created_at");
    });
  });
});
