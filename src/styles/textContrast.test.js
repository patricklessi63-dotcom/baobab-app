import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Garde-fou de lisibilité (thèmes sombre par défaut et clair ivoire) : un texte
// ne doit plus être posé avec une opacité codée en dur de l'encre (0,4 à 0,6 :
// 2,3 à 4,0:1 en clair, 4,0:1 en sombre) ni avec les anciennes couleurs
// d'avertissement (3,0 à 3,5:1 sur la nuit verte). Les jetons --bb-text-faint,
// --bb-gold-text, --bb-coral-text et --bb-accent tiennent 4,5:1 dans les deux thèmes.
function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(jsx|js)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const files = sources(path.resolve(process.cwd(), "src"));

describe("lisibilité du texte", () => {
  it("aucun texte à opacité d'encre codée en dur de 0,4 à 0,6", () => {
    const re = /\bcolor: ?["'`]rgba\(var\(--bb-(?:ink|text)-rgb(?:-static)?\), ?0?\.(?:[45]\d*|6)\)["'`]/;
    const bad = files.filter((f) => re.test(fs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("plus d'ancienne couleur ambre, verte ou rouge de texte à contraste insuffisant", () => {
    const re = /color: ?["'`]#(?:A5761F|1E7A4C|B3432B)["'`]/i;
    const bad = files.filter((f) => re.test(fs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
