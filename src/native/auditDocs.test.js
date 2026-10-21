import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Garde-fou de la phase 1 (audit de lancement) : les 4 livrables existent et la synthèse
// contient les 7 éléments demandés par le propriétaire, dans l'ordre.

const root = process.cwd();
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const DELIVERABLES = ["AUDIT-BAOBAB.md", "PLAN-LANCEMENT-15-NOV.md", "BAOBAB-AI.md", "SYNTHESE-PHASE-1.md"];

const SEVEN_HEADINGS = [
  "1. Diagnostic général",
  "2. Les cinq risques ou problèmes les plus importants",
  "3. Les dix améliorations prioritaires",
  "4. Plan d'action réaliste jusqu'au 15 novembre",
  "5. Fonctionnalités que le bot peut raisonnablement automatiser",
  "6. Éléments nécessitant l'approbation du propriétaire",
  "7. Tests confirmant que l'application est prête",
];

describe("Livrables de la phase 1 (audit)", () => {
  it.each(DELIVERABLES)("%s existe et n'est pas vide", (file) => {
    expect(exists(file)).toBe(true);
    expect(read(file).trim().length).toBeGreaterThan(500);
  });

  it("SYNTHESE-PHASE-1.md contient les 7 intitulés demandés, dans l'ordre", () => {
    const doc = read("SYNTHESE-PHASE-1.md");
    let last = -1;
    for (const heading of SEVEN_HEADINGS) {
      const idx = doc.indexOf(`## ${heading}`);
      expect(idx, `intitulé manquant : ${heading}`).toBeGreaterThan(-1);
      expect(idx, `intitulé hors ordre : ${heading}`).toBeGreaterThan(last);
      last = idx;
    }
  });

  it("SYNTHESE-PHASE-1.md reste courte (2 pages au plus ≈ 1 400 mots)", () => {
    const words = read("SYNTHESE-PHASE-1.md").split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(1400);
  });

  it("BAOBAB-AI.md distingue le conçu de l'implémenté", () => {
    const doc = read("BAOBAB-AI.md");
    expect(doc).toMatch(/RIEN N'EST IMPLÉMENTÉ/);
    expect(doc).toMatch(/Conçu ou implémenté/);
  });

  it("aucun livrable ne contient de clé secrète reconnaissable", () => {
    for (const file of DELIVERABLES) {
      const doc = read(file);
      expect(doc, file).not.toMatch(/sk_live_[A-Za-z0-9]{10,}/);
      expect(doc, file).not.toMatch(/sk-ant-[A-Za-z0-9]{10,}/);
      expect(doc, file).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/);
      expect(doc, file).not.toMatch(/whsec_[A-Za-z0-9]{10,}/);
    }
  });
});
