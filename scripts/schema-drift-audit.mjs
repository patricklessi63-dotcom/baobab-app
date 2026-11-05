// Usage : node scripts/schema-drift-audit.mjs <schema-prod.sql> [dossier-du-depot]
// (schema-prod.sql = export du catalogue de production, voir scripts/staging-export-schema.sql)
// Audit statique d'écart « dépôt vs production » : compare les colonnes de schema-prod.sql (export du catalogue de production)
// aux CREATE TABLE / ALTER TABLE ADD COLUMN des fichiers supabase-*.sql. Cherche surtout les écarts de TYPE (comme reports.id
// bigint en prod / uuid dans le dépôt), qui font échouer des fonctions en silence.
import fs from "node:fs";
import path from "node:path";

const [, , prodFile, repoDirArg] = process.argv;
const repoDir = repoDirArg || process.cwd();

const norm = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace("timestamp with time zone", "timestamptz")
    .replace("timestamp without time zone", "timestamp")
    .replace(/^bigserial.*/, "bigint")
    .replace(/^bigint .*/, "bigint")
    .replace(/^serial.*/, "integer")
    .replace(/^int$/, "integer")
    .replace(/^int4$/, "integer")
    .replace(/^int8$/, "bigint")
    .replace(/^character varying.*/, "text")
    .replace(/^varchar.*/, "text")
    .replace(/^numeric.*/, "numeric")
    .replace(/^double precision$/, "float8")
    .replace(/^uuid .*/, "uuid")
    .replace(/^text .*/, "text")
    .replace(/^boolean .*/, "boolean")
    .replace(/^integer .*/, "integer")
    .replace(/^jsonb .*/, "jsonb")
    .replace(/^timestamptz .*/, "timestamptz")
    .replace(/^date .*/, "date")
    .replace(/^text\[\].*/, "text[]")
    .replace(/^uuid\[\].*/, "uuid[]");

function splitTop(body) {
  const out = [];
  let depth = 0, cur = "", q = null;
  for (const ch of body) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseCreateTables(sql, into) {
  const re = /create table (?:if not exists )?(?:public\.)?("?[a-z_0-9]+"?)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = m[1].replace(/"/g, "").toLowerCase();
    let i = re.lastIndex, depth = 1, q = null;
    for (; i < sql.length && depth > 0; i++) {
      const ch = sql[i];
      if (q) { if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; continue; }
      if (ch === "(") depth++;
      if (ch === ")") depth--;
    }
    const body = sql.slice(re.lastIndex, i - 1);
    const cols = into.get(name) || new Map();
    for (const part of splitTop(body)) {
      const p = part.trim().replace(/--.*$/gm, "").trim();
      if (!p || /^(primary key|unique|constraint|foreign key|check|exclude|like)\b/i.test(p)) continue;
      const cm = /^("?[a-z_0-9]+"?)\s+([a-z_0-9]+(?:\s+with(?:out)? time zone)?(?:\(\d+(?:,\d+)?\))?(?:\[\])?)/i.exec(p);
      if (cm) cols.set(cm[1].replace(/"/g, "").toLowerCase(), norm(cm[2]));
    }
    into.set(name, cols);
  }
}

function parseAlterAdds(sql, into) {
  const re = /alter table (?:if exists )?(?:only )?(?:public\.)?("?[a-z_0-9]+"?)\s+((?:add column[^;]*?))(?:;)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = m[1].replace(/"/g, "").toLowerCase();
    const cols = into.get(name) || new Map();
    for (const part of splitTop(m[2])) {
      const cm = /add column (?:if not exists )?("?[a-z_0-9]+"?)\s+([a-z_0-9]+(?:\s+with(?:out)? time zone)?(?:\(\d+(?:,\d+)?\))?(?:\[\])?)/i.exec(part.trim());
      if (cm) cols.set(cm[1].replace(/"/g, "").toLowerCase(), norm(cm[2]));
    }
    into.set(name, cols);
  }
}

const prod = new Map();
parseCreateTables(fs.readFileSync(prodFile, "utf8"), prod);

const repo = new Map();
const files = fs.readdirSync(repoDir).filter((f) => /^supabase-.*\.sql$/.test(f) && !/COMBINED/.test(f));
for (const f of files) {
  const s = fs.readFileSync(path.join(repoDir, f), "utf8");
  parseCreateTables(s, repo);
  parseAlterAdds(s, repo);
}

const typeMismatch = [], onlyProd = [], onlyRepo = [], tablesOnlyProd = [], tablesOnlyRepo = [];
for (const [t, pc] of prod) {
  const rc = repo.get(t);
  if (!rc) { tablesOnlyProd.push(t); continue; }
  for (const [c, pt] of pc) {
    if (!rc.has(c)) onlyProd.push(`${t}.${c} (${pt})`);
    else if (rc.get(c) !== pt) typeMismatch.push(`${t}.${c} : prod=${pt} dépôt=${rc.get(c)}`);
  }
  for (const [c, rt] of rc) if (!pc.has(c)) onlyRepo.push(`${t}.${c} (${rt})`);
}
for (const t of repo.keys()) if (!prod.has(t)) tablesOnlyRepo.push(t);

console.log("Tables prod:", prod.size, "| tables dépôt:", repo.size);
console.log("\n=== ÉCARTS DE TYPE (prod ≠ dépôt) :", typeMismatch.length);
typeMismatch.forEach((x) => console.log("  ", x));
console.log("\n=== Colonnes présentes en PROD mais pas dans le dépôt :", onlyProd.length);
onlyProd.forEach((x) => console.log("  ", x));
console.log("\n=== Colonnes présentes dans le DÉPÔT mais pas en prod (SQL non exécuté ?) :", onlyRepo.length);
onlyRepo.forEach((x) => console.log("  ", x));
console.log("\n=== Tables en prod absentes du dépôt :", tablesOnlyProd.join(", ") || "aucune");
console.log("=== Tables du dépôt absentes de la prod (hors temporaires) :", tablesOnlyRepo.join(", ") || "aucune");
