import { describe, it, expect } from "vitest";
import { fetchFollowing, fetchFollowers, FOLLOWS_LIMIT } from "./followLists.js";

// Faux PostgREST : tronque à 1000 lignes par réponse (max_rows, sans erreur) et
// honore .range(). `all` = jeu complet des abonnés/abonnements côté serveur.
function makeCappedClient(all) {
  const requests = [];
  return {
    requests,
    client: {
      from(table) {
        const st = { table, select: "", eq: null, order: [], range: null };
        const b = {};
        b.select = (c) => { st.select = c; return b; };
        b.eq = (c, v) => { st.eq = [c, v]; return b; };
        b.order = (c, o) => { st.order.push([c, o?.ascending]); return b; };
        b.range = (from, to) => { st.range = [from, to]; return b; };
        b.limit = (n) => { st.limit = n; return b; };
        b.then = (res, rej) => {
          requests.push(st);
          const rows = (st.range ? all.slice(st.range[0], st.range[1] + 1) : all.slice(0, st.limit ?? all.length)).slice(0, 1000);
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        };
        return b;
      },
    },
  };
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({ from_id: `f-${i}`, to_id: `t-${i}`, profile: { id: `f-${i}` } }));

describe("followLists — plafond PostgREST de 1000 lignes", () => {
  it("1800 abonnés : tous renvoyés (sans pagination, .limit(2000) n'en livrait que 1000)", async () => {
    const fake = makeCappedClient(rows(1800));
    const res = await fetchFollowers(fake.client, "me-1");
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1800);
    expect(new Set(res.data.map((r) => r.from_id)).size).toBe(1800);
    fake.requests.forEach((r) => {
      expect(r.table).toBe("follows");
      expect(r.eq).toEqual(["to_id", "me-1"]);
      expect(r.select).toContain("from_id, profile:from_id(");
      // tri created_at desc, puis id (clé unique) : pages stables
      expect(r.order).toEqual([["created_at", false], ["id", false]]);
    });
  });

  it("abonnements : mêmes garanties côté from_id, et la borne historique de 2000 lignes est conservée", async () => {
    const fake = makeCappedClient(rows(3500));
    const res = await fetchFollowing(fake.client, "me-1");
    expect(res.data).toHaveLength(FOLLOWS_LIMIT);
    expect(fake.requests.map((r) => r.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(fake.requests[0].eq).toEqual(["from_id", "me-1"]);
    expect(fake.requests[0].select).toContain("to_id, profile:to_id(");
  });
});
