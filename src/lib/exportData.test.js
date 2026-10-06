import { describe, it, expect } from "vitest";
import { fetchExportData, exportCategories } from "./exportData.js";

// Faux client qui TRONQUE comme PostgREST (max_rows = 1000, sans erreur) et
// honore `.range(from, to)`. `data[table]` = jeu complet côté serveur.
function makeCappedClient(data, { failTable = null } = {}) {
  const requests = [];
  function builder(table) {
    const st = { table, order: [], range: null };
    const b = {};
    ["select", "eq", "neq", "or"].forEach((m) => { b[m] = () => b; });
    b.order = (c) => { st.order.push(c); return b; };
    b.range = (from, to) => { st.range = [from, to]; return b; };
    b.then = (res, rej) => {
      requests.push(st);
      if (table === failTable && st.range && st.range[0] >= 1000) {
        return Promise.resolve({ data: null, error: { message: "boom" } }).then(res, rej);
      }
      const all = data[table] || [];
      const rows = st.range ? all.slice(st.range[0], st.range[1] + 1) : all;
      return Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(res, rej);
    };
    return b;
  }
  return { requests, client: { from: builder } };
}

const rows = (n, make) => Array.from({ length: n }, (_, i) => make(i));

describe("fetchExportData — plafond PostgREST de 1000 lignes", () => {
  it("exporte TOUS les messages envoyés et reçus (2500 chacun), les likes reçus (1500) et les autres catégories", async () => {
    const fake = makeCappedClient({
      messages: rows(2500, (i) => ({ id: i, text: `m${i}` })), // même table pour envoyés/reçus : le faux ignore les filtres
      likes: rows(1500, (i) => ({ id: i, from_id: `u-${i}` })),
      blocks: rows(3, (i) => ({ id: `b-${i}`, to_id: `u-${i}` })),
    });
    const { keys, results } = await fetchExportData(fake.client, "me-1");
    const by = Object.fromEntries(keys.map((k, i) => [k, results[i]]));
    expect(by.messages_sent.error).toBeNull();
    expect(by.messages_sent.data).toHaveLength(2500);
    expect(by.messages_received.data).toHaveLength(2500);
    expect(by.likes_received.data).toHaveLength(1500);
    expect(by.likes_sent.data).toHaveLength(1500);
    expect(by.blocks.data).toHaveLength(3);
    expect(by.posts.data).toEqual([]);
    expect(new Set(by.messages_sent.data.map((m) => m.id)).size).toBe(2500);
  });

  it("toutes les catégories exportées sont paginées avec un tri sur id (pages stables)", async () => {
    const fake = makeCappedClient({});
    const { keys } = await fetchExportData(fake.client, "me-1");
    expect(keys).toEqual(Object.keys(exportCategories("me-1")));
    expect(keys.length).toBeGreaterThanOrEqual(17);
    expect(fake.requests).toHaveLength(keys.length);
    fake.requests.forEach((r) => {
      expect(r.order).toEqual(["id"]);
      expect(r.range).toEqual([0, 999]);
    });
  });

  it("une erreur sur la 2e page d'une catégorie la signale (data null) sans casser les autres — jamais un export tronqué muet", async () => {
    const fake = makeCappedClient({ likes: rows(2500, (i) => ({ id: i })), blocks: rows(2, (i) => ({ id: `b${i}` })) }, { failTable: "likes" });
    const { keys, results } = await fetchExportData(fake.client, "me-1");
    const by = Object.fromEntries(keys.map((k, i) => [k, results[i]]));
    expect(by.likes_sent.error.message).toBe("boom");
    expect(by.likes_sent.data).toBeNull();
    expect(by.blocks.data).toHaveLength(2);
  });
});
