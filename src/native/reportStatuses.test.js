// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// supabase-report-statuses.sql : statuts de signalement en attente / en cours d'examen / confirmé / rejeté / résolu.
// Schéma factice AVEC reports.id en bigint (comme la production, schema-prod.sql) ET en uuid. Honnêteté : pas la base Supabase
// (droits d'exécution et RLS non testés ici).

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-report-statuses.sql"), "utf8");

async function freshDb(idType) {
  const idCol = idType === "bigint" ? "id bigint generated always as identity primary key" : "id uuid default gen_random_uuid() primary key";
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create function is_moderator_or_above() returns boolean language sql as $$ select coalesce(current_setting('test.mod', true), 'on') = 'on' $$;
    create function current_profile_id() returns uuid language sql as $$ select null::uuid $$;
    create table admin_actions (id serial primary key, actor_id uuid, action_type text, metadata jsonb);
    create table community_reports (id uuid default gen_random_uuid(), target_type text, target_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table event_reports (id uuid default gen_random_uuid(), event_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table post_reports (id uuid default gen_random_uuid(), target_type text, target_id uuid, from_id uuid, category text, reason text, status text, created_at timestamptz default now());
    create table info_reports (id uuid default gen_random_uuid(), article_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    create table reports (${idCol}, to_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());
    insert into reports (category, created_at) values ('autre', now()), ('harcelement', now() - interval '1 day'), ('mineur_suspecte', now() - interval '30 days');
    insert into post_reports (target_type, category) values ('post', 'arnaque'); -- statut NULL : traité comme « open »
    insert into community_reports (target_type, category) values ('post', 'autre');
  `);
  await db.exec(SQL);
  return db;
}
const q = async (db, sql, params) => (await db.query(sql, params)).rows;
const fails = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };

describe.each(["bigint", "uuid"])("statuts de signalement avec reports.id en %s", (idType) => {
  it("le fichier se rejoue (create or replace) et la liste « à traiter » trie par priorité", async () => {
    const db = await freshDb(idType);
    try {
      await db.exec(SQL);
      const rows = await q(db, "select source, category, status from admin_list_reports('open')");
      expect(rows.map((r) => r.category)).toEqual(["mineur_suspecte", "arnaque", "harcelement", "autre", "autre"]);
      expect(rows.every((r) => r.status === "open")).toBe(true); // NULL -> open
    } finally { await db.close(); }
  });

  it("parcours complet : en attente -> en cours d'examen -> confirmé -> résolu ; chaque étape reste dans la file « à traiter » jusqu'à la clôture", async () => {
    const db = await freshDb(idType);
    try {
      const [{ id }] = await q(db, "select id from admin_list_reports('open') where category = 'mineur_suspecte'");
      await db.query("select admin_set_report_status('profile', $1::uuid, 'in_review', 'je regarde')", [id]);
      expect((await q(db, "select status from admin_list_reports('open') where category = 'mineur_suspecte'"))[0].status).toBe("in_review");
      await db.query("select admin_set_report_status('profile', $1::uuid, 'confirmed')", [id]);
      expect((await q(db, "select status from admin_list_reports('open') where category = 'mineur_suspecte'"))[0].status).toBe("confirmed");
      await db.query("select admin_resolve_report('profile', $1::uuid, false)", [id]);
      expect(await q(db, "select 1 from admin_list_reports('open') where category = 'mineur_suspecte'")).toEqual([]);
      expect((await q(db, "select status from admin_list_reports('resolved')"))[0].status).toBe("resolved");
      expect((await q(db, "select count(*)::int as n from admin_list_reports('all')"))[0].n).toBe(5);
      expect((await q(db, "select action_type from admin_actions")).map((r) => r.action_type)).toEqual(["report_resolved"]);
    } finally { await db.close(); }
  });

  it("rejet direct depuis l'attente ou l'examen ; plus aucune action une fois clos", async () => {
    const db = await freshDb(idType);
    try {
      const [{ id }] = await q(db, "select id from admin_list_reports('open') where category = 'harcelement'");
      await db.query("select admin_set_report_status('profile', $1::uuid, 'in_review')", [id]);
      await db.query("select admin_resolve_report('profile', $1::uuid, true)", [id]);
      expect((await q(db, "select status from admin_list_reports('dismissed')"))[0].status).toBe("dismissed");
      expect(await fails(() => db.query("select admin_resolve_report('profile', $1::uuid, false)", [id]))).toContain("deja traite");
      expect(await fails(() => db.query("select admin_set_report_status('profile', $1::uuid, 'in_review')", [id]))).toContain("deja traite");
    } finally { await db.close(); }
  });

  it("transitions contrôlées : une infraction confirmée ne revient pas en arrière ; relâcher une prise en charge est permis ; statut invalide refusé", async () => {
    const db = await freshDb(idType);
    try {
      const [{ id }] = await q(db, "select id from admin_list_reports('open') where category = 'arnaque'"); // post_reports, id uuid, statut NULL au départ
      await db.query("select admin_set_report_status('post', $1::uuid, 'in_review')", [id]);
      await db.query("select admin_set_report_status('post', $1::uuid, 'open')", [id]); // relâché
      await db.query("select admin_set_report_status('post', $1::uuid, 'confirmed')", [id]);
      expect(await fails(() => db.query("select admin_set_report_status('post', $1::uuid, 'open')", [id]))).toContain("Transition invalide");
      expect(await fails(() => db.query("select admin_set_report_status('post', $1::uuid, 'resolved')", [id]))).toContain("Statut invalide");
      expect(await fails(() => db.query("select admin_set_report_status('inconnue', $1::uuid, 'in_review')", [id]))).toContain("Source inconnue");
      await db.query("select admin_set_report_status('post', $1::uuid, 'confirmed')", [id]); // idempotent
    } finally { await db.close(); }
  });

  it("réservé aux modérateurs : refusé sinon, sur la liste comme sur chaque action", async () => {
    const db = await freshDb(idType);
    try {
      const [{ id }] = await q(db, "select id from admin_list_reports('open') limit 1");
      await db.exec("select set_config('test.mod', 'off', false)");
      expect(await fails(() => db.query("select * from admin_list_reports('open')"))).toContain("Non autorise");
      expect(await fails(() => db.query("select admin_set_report_status('profile', $1::uuid, 'in_review')", [id]))).toContain("Non autorise");
      expect(await fails(() => db.query("select admin_resolve_report('profile', $1::uuid, false)", [id]))).toContain("Non autorise");
    } finally { await db.close(); }
  });

  it("journal : les étapes intermédiaires vont dans moderation_decisions SI la table existe, sans dépendance dure", async () => {
    const db = await freshDb(idType);
    try {
      const [{ id }] = await q(db, "select id from admin_list_reports('open') where category = 'autre' and source = 'profile'");
      await db.query("select admin_set_report_status('profile', $1::uuid, 'in_review')", [id]); // pas de table : aucune erreur
      await db.exec("create table moderation_decisions (id serial primary key, actor_id uuid, action text, target_ref text, reason text)");
      await db.query("select admin_set_report_status('profile', $1::uuid, 'confirmed', 'insulte avérée')", [id]);
      expect(await q(db, "select action, reason from moderation_decisions")).toEqual([{ action: "report_confirmed", reason: "insulte avérée" }]);
    } finally { await db.close(); }
  });
});
