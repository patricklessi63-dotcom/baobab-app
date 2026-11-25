// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Garde-fou : comparer deux villes par `normalizeForSearch(a.trim()) === normalizeForSearch(b.trim())`
// considère deux villes faites d'espaces comme « la même ville » (chaîne vide = chaîne vide) : sections
// « Près de toi » / « Autour de toi » remplies à tort. La comparaison passe par samePlaceText
// (src/lib/searchQuery.js), qui exige une valeur non vide.

const root = path.join(process.cwd(), "src");
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return files(p);
  return /\.(js|jsx)$/.test(e.name) && !/\.test\.(js|jsx)$/.test(e.name) ? [p] : [];
});

describe("comparaisons de ville", () => {
  it("aucune comparaison de ville par égalité de normalizeForSearch (utiliser samePlaceText)", () => {
    const re = /normalizeForSearch\([\w.?]*\b(city|country|province)\b[\w.?]*(\(\))?\)\s*===\s*normalizeForSearch\(/;
    const offenders = files(root).filter((f) => re.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });
});
