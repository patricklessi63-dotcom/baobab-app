import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Les ressources Android sont compilées par aapt2 (analyseur expat, strict) : un
// seul fichier XML mal formé (ex. "--" dans un commentaire, interdit par la
// spécification XML) fait échouer TOUTE la compilation de l'app, sans que ni le
// build web ni les tests ne s'en aperçoivent. Ce test lit les fichiers du
// dépôt et vérifie (1) qu'ils sont bien formés, (2) que chaque @type/nom
// référencé existe.

const MAIN = path.resolve(process.cwd(), "android/app/src/main");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const xmlFiles = [path.join(MAIN, "AndroidManifest.xml"), ...walk(path.join(MAIN, "res")).filter((f) => f.endsWith(".xml"))];

describe("ressources Android", () => {
  it("trouve des fichiers à vérifier", () => {
    expect(xmlFiles.length).toBeGreaterThan(5);
  });

  it.each(xmlFiles.map((f) => [path.relative(MAIN, f).split(path.sep).join("/"), f]))("%s est du XML bien formé", (_name, file) => {
    const doc = new DOMParser().parseFromString(fs.readFileSync(file, "utf8"), "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    expect(err ? err.textContent : "").toBe("");
  });

  it("chaque ressource référencée existe (hors ressources fournies par Capacitor/AppCompat)", () => {
    const resDir = path.join(MAIN, "res");
    // Définies par les bibliothèques (capacitor-android/colors.xml), pas par l'app.
    const provided = new Set(["color/colorPrimary", "color/colorPrimaryDark", "color/colorAccent"]);
    const defined = new Set(provided);
    for (const f of walk(resDir)) {
      const rel = path.relative(resDir, f).split(path.sep).join("/");
      const [folder, file] = rel.split("/");
      const type = folder.split("-")[0];
      if (!file) continue;
      if (folder.startsWith("values")) {
        const text = fs.readFileSync(f, "utf8");
        for (const m of text.matchAll(/<(color|string|style|dimen|bool|integer)\s+name="([^"]+)"/g)) defined.add(`${m[1]}/${m[2].replace(/\./g, "_")}`);
      } else {
        defined.add(`${type}/${file.replace(/\.[^.]+$/, "")}`);
      }
    }
    const missing = [];
    for (const f of xmlFiles) {
      const text = fs.readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "");
      for (const m of text.matchAll(/@(color|style|drawable|mipmap|string|xml|layout)\/([A-Za-z0-9_.]+)/g)) {
        const key = `${m[1]}/${m[2].replace(/\./g, "_")}`;
        if (!defined.has(key)) missing.push(`${path.basename(f)} -> @${m[1]}/${m[2]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
