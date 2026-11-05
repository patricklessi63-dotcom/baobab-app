// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Régression du 5 novembre 2026 : admin_list_reports() renvoyait HTTP 400 à chaque appel en production
// (« column reference "category" is ambiguous », code 42702) parce que RETURNS TABLE expose une colonne « category » et que
// l'ORDER BY de supabase-admin-lists-limit-fix.sql ne la qualifiait pas. Chaque définition du dépôt est rejouée ici sur un vrai
// moteur PostgreSQL (PGlite) : elle doit s'exécuter, trier les catégories prioritaires en tête, et plafonner à 200 lignes.
// Honnêteté : schéma factice, pas la base Supabase (le droit d'exécution et la RLS ne sont pas testés ici).

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

// Dernière définition d'admin_list_reports dans le fichier (le script consolidé en contient plusieurs : c'est la dernière qui reste en base).
function lastDefinition(sql) {
  const starts = [...sql.matchAll(/create or replace function admin_list_reports\(/g)].map((m) => m.index);
  if (!starts.length) return null;
  const start = starts[starts.length - 1];
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
}

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create function is_moderator_or_above() returns boolean language sql as $$ select true $$;
    create table community_reports (id uuid default gen_random_uuid(), target_type text, target_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table event_reports (id uuid default gen_random_uuid(), event_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table post_reports (id uuid default gen_random_uuid(), target_type text, target_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table info_reports (id uuid default gen_random_uuid(), article_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table reports (id uuid default gen_random_uuid(), to_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    insert into reports (category, created_at) values ('autre', now()), ('harcelement', now() - interval '1 day'), ('mineur_suspecte', now() - interval '30 days'), ('arnaque', now() - interval '2 days');
  `);
  return db;
}

// Fichiers dont la définition finale doit fonctionner avec le tri par priorité.
const WITH_PRIORITY = [
  "supabase-report-minor-category.sql",
  "supabase-admin-lists-limit-fix.sql",
  "supabase-admin-list-reports-hotfix.sql",
  "supabase-COMBINED-pending-fixes.sql",
];

describe("admin_list_reports : chaque définition du dépôt s'exécute", () => {
  it.each(WITH_PRIORITY)("%s : s'exécute, priorité mineur > arnaque > harcèlement > autre", async (file) => {
    const def = lastDefinition(read(file));
    expect(def, `${file} contient une définition`).toBeTruthy();
    const db = await freshDb();
    try {
      await db.exec(def);
      const r = await db.query("select category from admin_list_reports('open')");
      expect(r.rows.map((x) => x.category)).toEqual(["mineur_suspecte", "arnaque", "harcelement", "autre"]);
    } finally {
      await db.close();
    }
  });

  it.each(["supabase-admin-lists-limit-fix.sql", "supabase-admin-list-reports-hotfix.sql", "supabase-COMBINED-pending-fixes.sql"])(
    "%s : plafonne à 200 lignes et filtre par statut",
    async (file) => {
      const db = await freshDb();
      try {
        await db.exec(lastDefinition(read(file)));
        await db.exec("insert into reports (category, status) select 'autre', 'open' from generate_series(1, 300); insert into reports (category, status) values ('autre', 'resolved')");
        expect((await db.query("select count(*)::int as n from admin_list_reports('open')")).rows[0].n).toBe(200);
        expect((await db.query("select count(*)::int as n from admin_list_reports('resolved')")).rows[0].n).toBe(1);
        // la catégorie prioritaire reste en tête même au-delà du plafond
        expect((await db.query("select category from admin_list_reports('open') limit 1")).rows[0].category).toBe("mineur_suspecte");
      } finally {
        await db.close();
      }
    },
  );

  it("le correctif est rejouable (create or replace deux fois)", async () => {
    const db = await freshDb();
    try {
      const def = lastDefinition(read("supabase-admin-list-reports-hotfix.sql"));
      await db.exec(def);
      await db.exec(def);
      expect((await db.query("select count(*)::int as n from admin_list_reports('open')")).rows[0].n).toBe(4);
    } finally {
      await db.close();
    }
  });
});
