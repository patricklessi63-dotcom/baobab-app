import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// « Réduire les animations » (data-motion sur <html>) et prefers-reduced-motion
// posent `animation: none !important`. Une règle qui cache un élément en
// opacity: 0 et compte sur son animation pour le faire apparaître le laisserait
// donc INVISIBLE à jamais : c'était le cas des titres de /connexion et
// /inscription. L'état de base doit rester visible ; l'animation part de
// l'état caché avec `backwards`.
function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(jsx|js|css)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...sources(path.resolve(process.cwd(), "src")), path.resolve(process.cwd(), "index.html")];

describe("contenu visible sans animation", () => {
  it("aucune règle ne combine opacity: 0 de base et une animation d'apparition", () => {
    const offenders = [];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      // Corps de règle { ... } hors @keyframes (un corps de keyframes ne contient pas « animation: »).
      for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
        const body = m[1];
        if (/(^|[;\s])opacity:\s*0\s*(;|$)/.test(body) && /(^|[;\s])animation:/.test(body)) offenders.push(`${path.relative(process.cwd(), f)} : ${body.trim().slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
