import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Garde-fou du document opérationnel LANCEMENT.md : un futur fichier SQL ou une future edge function
// oubliés dans ce document font échouer la CI (le propriétaire suit ce seul document pour lancer).

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const doc = read("LANCEMENT.md");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Mentionné = le nom exact apparaît, sans être le morceau d'un nom plus long.
const mentioned = (name) => new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(name)}(?![A-Za-z0-9_-])`).test(doc);

const sqlFiles = fs
  .readdirSync(root)
  .filter((f) => /^supabase-.*\.sql$/.test(f))
  .sort();

const functionDirs = fs
  .readdirSync(path.join(root, "supabase", "functions"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort();

describe("LANCEMENT.md — couverture des fichiers SQL", () => {
  it("il existe des fichiers SQL à couvrir (le test ne passe pas à vide)", () => {
    expect(sqlFiles.length).toBeGreaterThan(100);
  });

  it("chaque fichier supabase-*.sql du dépôt est mentionné dans LANCEMENT.md", () => {
    const missing = sqlFiles.filter((f) => !mentioned(f));
    expect(missing, `Fichier(s) SQL absent(s) de LANCEMENT.md (ajoute-les à l'inventaire §7 et, si à exécuter, aux fiches §5) : ${missing.join(", ")}`).toEqual([]);
  });

  it("LANCEMENT.md ne cite aucun fichier supabase-*.sql inexistant (faute de frappe ou fichier supprimé)", () => {
    const cited = new Set([...doc.matchAll(/supabase-[A-Za-z0-9-]+\.sql/g)].map((m) => m[0]));
    const unknown = [...cited].filter((f) => !sqlFiles.includes(f));
    expect(unknown).toEqual([]);
  });

  it("chaque fichier SQL figure dans l'inventaire (tableau §7) avec une catégorie", () => {
    const inventory = doc.slice(doc.indexOf("## 7. Inventaire"), doc.indexOf("## 8. Edge functions"));
    const missing = sqlFiles.filter((f) => !inventory.includes("`" + f + "`"));
    expect(missing).toEqual([]);
    for (const heading of ["Catégorie A", "Catégorie B", "Catégorie C", "Catégorie D"]) {
      expect(inventory).toContain(heading);
    }
  });
});

describe("LANCEMENT.md — couverture des edge functions", () => {
  it("il existe des edge functions à couvrir", () => {
    expect(functionDirs.length).toBeGreaterThanOrEqual(8);
  });

  it("chaque dossier de supabase/functions (hors _shared) est mentionné", () => {
    const missing = functionDirs.filter((n) => !mentioned(n));
    expect(missing, `Edge function(s) absente(s) de LANCEMENT.md (§8) : ${missing.join(", ")}`).toEqual([]);
  });

  it("chaque edge function a une ligne dans le tableau d'état du §8.1", () => {
    const table = doc.slice(doc.indexOf("### 8.1"), doc.indexOf("### 8.2"));
    const missing = functionDirs.filter((n) => !table.includes("`" + n + "`"));
    expect(missing).toEqual([]);
  });
});

describe("LANCEMENT.md — cohérence", () => {
  it("le project-ref cité est celui utilisé par le code (URL des fonctions dans les SQL)", () => {
    const ref = "vozehymbihnckzklxesw";
    expect(doc).toContain(ref);
    const sqlWithRef = sqlFiles.filter((f) => read(f).includes(ref));
    expect(sqlWithRef.length).toBeGreaterThan(0);
    // aucun autre project-ref (20 caractères minuscules) dans les URL de fonctions citées par le document
    const refs = new Set([...doc.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)].map((m) => m[1]));
    expect([...refs]).toEqual([ref]);
  });

  it("les commandes de déploiement de send-push portent --no-verify-jwt (sinon les triggers push échouent en 401)", () => {
    const lines = doc.split("\n").filter((l) => /functions deploy send-push/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toContain("--no-verify-jwt");
  });

  it("le document est opérationnel : table des matières, cases à cocher, 12 étapes du lancement minimal", () => {
    expect(doc).toContain("## Table des matières");
    expect((doc.match(/^\s*- \[ \]/gm) || []).length).toBeGreaterThan(60);
    const minimal = doc.slice(doc.indexOf("## 3. Lancement web minimal"), doc.indexOf("## 4. Étape 0"));
    const steps = [...minimal.matchAll(/^- \[ \] \*\*(\d+)\./gm)].map((m) => Number(m[1]));
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("le bloc « bilan » (lecture seule) ne contient aucune instruction d'écriture", () => {
    const m = doc.match(/```sql\nwith\n([\s\S]*?)\n```/);
    expect(m).not.toBeNull();
    const bilan = m[0].replace(/'(?:[^']|'')*'/g, "''"); // ignore le contenu des chaînes
    expect(bilan).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i);
  });

  it("aucun secret n'est écrit dans LANCEMENT.md", () => {
    expect(doc).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{10,}/);
    expect(doc).not.toMatch(/whsec_[A-Za-z0-9]{10,}/);
    expect(doc).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(doc).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  });
});

describe("renvois vers LANCEMENT.md depuis les autres documents", () => {
  it.each(["DEPLOIEMENT.md", "MOBILE.md", "STORES.md"])("%s pointe vers LANCEMENT.md dès ses premières lignes", (file) => {
    const head = read(file).split("\n").slice(0, 8).join("\n");
    expect(head).toContain("LANCEMENT.md");
  });
});
