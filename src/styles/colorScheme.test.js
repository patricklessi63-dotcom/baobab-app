import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Sans `color-scheme`, les contrôles natifs (listes déroulantes, calendriers,
// sélecteurs d'heure, barres de défilement) restent clairs même dans le thème
// sombre, devenu le thème par défaut : texte clair sur liste blanche, icônes de
// calendrier noires sur champ sombre.
const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
const block = (start) => {
  const i = html.indexOf(start);
  expect(i, start).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf("}", i));
};

describe("color-scheme des contrôles natifs", () => {
  it("clair par défaut", () => expect(block(":root {")).toMatch(/color-scheme:\s*light/));
  it("sombre pour le choix manuel", () => expect(block(':root[data-theme="dark"] {')).toMatch(/color-scheme:\s*dark/));
  it("sombre pour le réglage Système en sombre", () => expect(block(':root:not([data-theme="light"]) {')).toMatch(/color-scheme:\s*dark/));
});
