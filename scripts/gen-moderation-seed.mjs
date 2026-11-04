// Génère la section « liste de départ » de supabase-moderation-text.sql à partir de
// src/config/moderationTerms.seed.json (source unique). À relancer après toute modification du JSON :
//   node scripts/gen-moderation-seed.mjs
// Le test src/lib/contentModeration.sqlMirror.test.js échoue si le SQL n'est plus à jour.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlFile = join(root, "supabase-moderation-text.sql");
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function buildSeedBlock(seed) {
  const terms = seed.terms.map((t) => `  (${q(t.term)}, '', ${q(t.category)}, ${q(t.severity)})`).join(",\n");
  const exceptions = seed.exceptions.map((p) => `  (${q(p)}, '')`).join(",\n");
  return [
    "insert into moderation_terms (term, term_norm, category, severity) values",
    terms,
    "on conflict (term_norm) do nothing;",
    "",
    "insert into moderation_exceptions (phrase, phrase_norm) values",
    exceptions,
    "on conflict (phrase_norm) do nothing;",
  ].join("\n");
}

export function applySeed(sql, seed) {
  const start = sql.indexOf("-- BEGIN SEED\n");
  const end = sql.indexOf("-- END SEED");
  if (start === -1 || end === -1) throw new Error("repères BEGIN SEED / END SEED introuvables");
  return sql.slice(0, start) + "-- BEGIN SEED\n" + buildSeedBlock(seed) + "\n" + sql.slice(end);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const seed = JSON.parse(readFileSync(join(root, "src/config/moderationTerms.seed.json"), "utf8"));
  writeFileSync(sqlFile, applySeed(readFileSync(sqlFile, "utf8"), seed));
  console.log(`${seed.terms.length} termes et ${seed.exceptions.length} exceptions écrits dans supabase-moderation-text.sql`);
}
