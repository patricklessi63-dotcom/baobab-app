import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Les boutons .bb-hit étendent leur zone tactile par un pseudo-élément ::after de
// 44 px (voir tailwind.css, pointeurs tactiles uniquement). Dans une rangée
// `overflow-x-auto`, l'overflow vertical vaut alors `auto` (règle CSS) : le
// pseudo-élément qui dépasse sous les pastilles ajoutait quelques pixels de
// défilement VERTICAL parasite à la rangée (mesuré : scrollHeight 36 > 32).
// Toute rangée `overflow-x-auto` qui contient des .bb-hit doit donc aussi poser
// `overflow-y-hidden`.

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(path.resolve(process.cwd(), "src")).filter((f) => f.endsWith(".jsx") && !/\.test\./.test(f));

describe("rangées défilantes horizontales avec boutons .bb-hit", () => {
  it("posent overflow-y-hidden", () => {
    const offenders = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/overflow-x-auto/.test(line) || /overflow-y-hidden/.test(line)) return;
        // Les enfants directs de la rangée tiennent dans les lignes qui suivent.
        const after = lines.slice(i + 1, i + 12).join("\n");
        if (/bb-hit/.test(after)) offenders.push(`${path.relative(process.cwd(), f).split(path.sep).join("/")}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
