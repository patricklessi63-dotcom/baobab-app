// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Safari / iOS avant la version 18 n'applique `backdrop-filter` que sous sa forme préfixée
// (`-webkit-backdrop-filter`). Autoprefixer traite les fichiers CSS, mais PAS les styles en ligne de
// React (`style={{ backdropFilter: ... }}`) : sans `WebkitBackdropFilter`, le flou des fenêtres
// modales et des voiles disparaît sur les iPhone qui ne sont pas à jour. Ce test impose la paire
// sur chaque ligne qui déclare `backdropFilter` dans un composant.

const root = path.join(process.cwd(), "src");

function jsxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsxFiles(p);
    return /\.jsx$/.test(e.name) && !/\.test\.jsx$/.test(e.name) ? [p] : [];
  });
}

describe("backdrop-filter dans les styles en ligne", () => {
  it("chaque `backdropFilter` est accompagné de `WebkitBackdropFilter` (Safari < 18)", () => {
    const offenders = [];
    let total = 0;
    for (const file of jsxFiles(root)) {
      fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (!/backdropFilter\s*:/.test(line.replace(/WebkitBackdropFilter\s*:/g, ""))) return;
        total += 1;
        if (!/WebkitBackdropFilter\s*:/.test(line)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
      });
    }
    expect(total).toBeGreaterThan(20); // le test ne passe pas à vide
    expect(offenders, `Ajoute WebkitBackdropFilter à côté de backdropFilter : ${offenders.join(", ")}`).toEqual([]);
  });
});
