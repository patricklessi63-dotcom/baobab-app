import { describe, it, expect } from "vitest";
import { chunk } from "./chunk.js";

describe("chunk", () => {
  it("découpe en lots de taille fixe, dernier lot possiblement plus court", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("tableau vide, null ou Set", () => {
    expect(chunk([], 3)).toEqual([]);
    expect(chunk(null, 3)).toEqual([]);
    expect(chunk(new Set(["a", "b", "c"]), 2)).toEqual([["a", "b"], ["c"]]);
  });
  it("taille invalide : se replie sur 1 plutôt que de boucler", () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunk([1, 2], NaN)).toEqual([[1], [2]]);
  });
  it("500 uuids en lots de 100 : 5 requêtes d'environ 3,7 ko d'URL chacune", () => {
    const ids = Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const lots = chunk(ids, 100);
    expect(lots).toHaveLength(5);
    expect(lots.every((l) => l.join(",").length < 4000)).toBe(true);
  });
});
