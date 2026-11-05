// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Régression du 5 novembre 2026 : admin_list_reports() renvoyait HTTP 400 à chaque appel en production, pour DEUX raisons :
//  1. reports.id est bigint en PRODUCTION (schema-prod.sql) alors que community/event/post/info_reports ont un id uuid :
//     « UNION types uuid and bigint cannot be matched » (erreur d'analyse, vue dans les journaux Postgres) ;
//  2. l'ORDER BY « case category » non qualifié était ambigu avec la colonne de sortie : « column reference "category" is ambiguous ».
// Chaque définition du dépôt est rejouée sur un vrai moteur PostgreSQL (PGlite), avec reports.id en bigint (comme la production)
// ET en uuid. Honnêteté : schéma factice, pas la base Supabase (droits d'exécution et RLS non testés ici).

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

// Dernière définition de la fonction nommée dans le fichier (le script consolidé en contient plusieurs : la dernière reste en base).
function lastDefinition(sql, fn, mustContain) {
  const starts = [...sql.matchAll(new RegExp(`create or replace function ${fn}\\(`, "g"))]
    .map((m) => m.index)
    .filter((i) => !mustContain || sql.slice(i, sql.indexOf("$$;", i) + 3).includes(mustContain));
  if (!starts.length) return null;
  const start = starts[starts.length - 1];
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
}

async function freshDb(reportsIdType) {
  const idCol = reportsIdType === "bigint" ? "id bigint generated always as identity primary key" : "id uuid default gen_random_uuid() primary key";
  const db = new PGlite();
  await db.exec(`
    create function is_moderator_or_above() returns boolean language sql as $$ select true $$;
    create function current_profile_id() returns uuid language sql as $$ select null::uuid $$;
    create table admin_actions (id serial primary key, actor_id uuid, action_type text, metadata jsonb);
    create table community_reports (id uuid default gen_random_uuid(), target_type text, target_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table event_reports (id uuid default gen_random_uuid(), event_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table post_reports (id uuid default gen_random_uuid(), target_type text, target_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table info_reports (id uuid default gen_random_uuid(), article_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table reports (${idCol}, to_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    insert into reports (category, created_at) values ('autre', now()), ('harcelement', now() - interval '1 day'), ('mineur_suspecte', now() - interval '30 days'), ('arnaque', now() - interval '2 days');
  `);
  return db;
}

// Fichiers dont la définition finale d'admin_list_reports doit fonctionner AVEC reports.id bigint (cas de la production).
const BIGINT_SAFE = ["supabase-admin-lists-limit-fix.sql", "supabase-admin-list-reports-hotfix.sql", "supabase-COMBINED-pending-fixes.sql"];

describe.each(["bigint", "uuid"])("admin_list_reports avec reports.id en %s", (idType) => {
  it.each(BIGINT_SAFE)("%s : s'exécute ; priorité mineur > arnaque > harcèlement > autre", async (file) => {
    const def = lastDefinition(read(file), "admin_list_reports");
    expect(def, `${file} contient une définition`).toBeTruthy();
    const db = await freshDb(idType);
    try {
      await db.exec(def);
      const r = await db.query("select category from admin_list_reports('open')");
      expect(r.rows.map((x) => x.category)).toEqual(["mineur_suspecte", "arnaque", "harcelement", "autre"]);
    } finally {
      await db.close();
    }
  });

  it("le correctif plafonne à 200 lignes, filtre par statut, garde la priorité en tête et est rejouable", async () => {
    const db = await freshDb(idType);
    try {
      const def = lastDefinition(read("supabase-admin-list-reports-hotfix.sql"), "admin_list_reports");
      await db.exec(def);
      await db.exec(def);
      await db.exec("insert into reports (category, status) select 'autre', 'open' from generate_series(1, 300); insert into reports (category, status) values ('autre', 'resolved')");
      expect((await db.query("select count(*)::int as n from admin_list_reports('open')")).rows[0].n).toBe(200);
      expect((await db.query("select count(*)::int as n from admin_list_reports('resolved')")).rows[0].n).toBe(1);
      expect((await db.query("select category from admin_list_reports('open') limit 1")).rows[0].category).toBe("mineur_suspecte");
    } finally {
      await db.close();
    }
  });

  it("un signalement de profil listé peut être traité (id réversible), une seule fois ; les autres sources sont inchangées", async () => {
    const db = await freshDb(idType);
    try {
      const hotfix = read("supabase-admin-list-reports-hotfix.sql");
      await db.exec(lastDefinition(hotfix, "admin_list_reports"));
      await db.exec(lastDefinition(hotfix, "admin_resolve_report"));
      const [mineur] = (await db.query("select id, source from admin_list_reports('open') where category = 'mineur_suspecte'")).rows;
      expect(mineur.source).toBe("profile");
      if (idType === "bigint") expect(mineur.id).toMatch(/^0{16}[0-9a-f]{16}$|^00000000-0000-0000-0000-[0-9a-f]{12}$/);

      await db.query("select admin_resolve_report('profile', $1::uuid, false)", [mineur.id]);
      expect((await db.query("select status from reports where category = 'mineur_suspecte'")).rows[0].status).toBe("resolved");
      expect((await db.query("select count(*)::int as n from admin_list_reports('open')")).rows[0].n).toBe(3);
      await expect(db.query("select admin_resolve_report('profile', $1::uuid, true)", [mineur.id])).rejects.toThrow(/deja traite/);
      expect((await db.query("select action_type from admin_actions")).rows).toEqual([{ action_type: "report_resolved" }]);

      // autre source : toujours verrouillée et contrôlée comme avant
      const [{ id: cid }] = (await db.query("insert into community_reports (category, status) values ('autre', 'open') returning id")).rows;
      await db.query("select admin_resolve_report('community', $1::uuid, true)", [cid]);
      await expect(db.query("select admin_resolve_report('community', $1::uuid, true)", [cid])).rejects.toThrow(/deja traite/);
      await expect(db.query("select admin_resolve_report('inconnue', $1::uuid, true)", [cid])).rejects.toThrow(/Source inconnue/);
    } finally {
      await db.close();
    }
  });
});

describe("les anciennes définitions (avant correctif) échouaient bien comme en production", () => {
  it("le UNION uuid / bigint est refusé à l'analyse avec la version de supabase-report-minor-category.sql", async () => {
    const db = await freshDb("bigint");
    try {
      await db.exec(lastDefinition(read("supabase-report-minor-category.sql"), "admin_list_reports"));
      await expect(db.query("select * from admin_list_reports('open')")).rejects.toThrow(/UNION types uuid and bigint cannot be matched/);
    } finally {
      await db.close();
    }
  });
});
