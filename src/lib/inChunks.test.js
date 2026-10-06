import { describe, it, expect } from "vitest";
import { selectInChunks } from "./inChunks.js";

const ids = Array.from({ length: 350 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("selectInChunks", () => {
  it("350 ids : 4 lots de 100 ids au plus, résultats fusionnés dans l'ordre", async () => {
    const seen = [];
    const { data, errors } = await selectInChunks(ids, async (lot) => {
      seen.push(lot.length);
      return { data: lot.map((id) => ({ id })), error: null };
    });
    expect(seen.sort((a, b) => b - a)).toEqual([100, 100, 100, 50]);
    expect(errors).toEqual([]);
    expect(data.map((r) => r.id)).toEqual(ids);
  });
  it("un lot en erreur (réponse ou rejet) ne fait pas perdre les autres", async () => {
    let n = 0;
    const { data, errors, failedLots } = await selectInChunks(ids, async (lot) => {
      const k = n++;
      if (k === 1) return { data: null, error: { message: "414" } };
      if (k === 2) throw new Error("réseau");
      return { data: lot.map((id) => ({ id })), error: null };
    });
    expect(data).toHaveLength(150);
    expect(errors).toHaveLength(2);
    expect(failedLots.map((l) => l.length)).toEqual([100, 100]);
  });
  it("liste vide : aucune requête", async () => {
    let called = 0;
    const r = await selectInChunks([], async () => { called++; return { data: [], error: null }; });
    expect(called).toBe(0);
    expect(r).toEqual({ data: [], errors: [], failedLots: [] });
  });
  it("parallélisme borné", async () => {
    let active = 0, peak = 0;
    await selectInChunks(ids, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { data: [], error: null };
    }, { size: 10, concurrency: 3 });
    expect(peak).toBe(3);
  });
});

describe("selectAllPages", () => {
  it("enchaîne les pages tant qu'une page est pleine (plafond PostgREST de 1000 lignes)", async () => {
    const { selectAllPages } = await import("./inChunks.js");
    const all = Array.from({ length: 2500 }, (_, i) => ({ i }));
    const ranges = [];
    const r = await selectAllPages(async (from, to) => { ranges.push([from, to]); return { data: all.slice(from, to + 1), error: null }; });
    expect(r.data).toHaveLength(2500);
    expect(r.error).toBeNull();
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("une erreur sur une page invalide le lot entier", async () => {
    const { selectAllPages } = await import("./inChunks.js");
    let n = 0;
    const r = await selectAllPages(async () => (n++ === 0 ? { data: new Array(1000).fill({}), error: null } : { data: null, error: { message: "boom" } }));
    expect(r).toEqual({ data: null, error: { message: "boom" } });
  });
});
