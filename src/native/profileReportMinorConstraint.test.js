// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PROFILE_REPORT_CATEGORIES, POST_REPORT_CATEGORIES } from "../lib/reportCategories.js";

// supabase-profile-report-minor-constraint-fix.sql : en PRODUCTION (schema-prod.sql) reports_category_check n'accepte pas
// « mineur_suspecte » alors que le client propose « Mineur suspecté ». Schéma factice avec la contrainte de production
// (reports.id bigint comme en production). Honnêteté : pas la base Supabase.

const FIX = fs.readFileSync(path.join(process.cwd(), "supabase-profile-report-minor-constraint-fix.sql"), "utf8");
const PROD_CHECK = "check (category is null or category = any (array['harcelement','spam','faux_profil','contenu_inapproprie','arnaque','autre']))";

async function prodLikeDb() {
  const db = new PGlite();
  await db.exec(`create table reports (id bigint generated always as identity primary key, to_id uuid, from_id uuid, category text, reason text, status text default 'open', constraint reports_category_check ${PROD_CHECK})`);
  return db;
}
const fails = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };

describe("signalement de profil : « Mineur suspecté »", () => {
  it("le client propose bien ce motif pour un profil (et pas pour une publication)", () => {
    expect(PROFILE_REPORT_CATEGORIES.map((c) => c.value)).toContain("mineur_suspecte");
    expect(POST_REPORT_CATEGORIES.map((c) => c.value)).not.toContain("mineur_suspecte");
  });

  it("AVANT le correctif, la base de production refuse ce motif (le défaut)", async () => {
    const db = await prodLikeDb();
    try {
      expect(await fails(() => db.query("insert into reports (category) values ('mineur_suspecte')"))).toContain("reports_category_check");
    } finally { await db.close(); }
  });

  it("APRÈS le correctif : tous les motifs proposés par le client sont acceptés, un motif inconnu reste refusé, les lignes existantes sont conservées", async () => {
    const db = await prodLikeDb();
    try {
      await db.exec("insert into reports (category) values ('harcelement'), (null), ('autre')");
      await db.exec(FIX);
      for (const c of PROFILE_REPORT_CATEGORIES) {
        expect(await fails(() => db.query("insert into reports (category) values ($1)", [c.value])), c.value).toBeNull();
      }
      expect(await fails(() => db.query("insert into reports (category) values ('nimporte-quoi')"))).toContain("reports_category_check");
      expect((await db.query("select count(*)::int as n from reports where category = 'harcelement' or category is null")).rows[0].n).toBeGreaterThanOrEqual(2);
    } finally { await db.close(); }
  });

  it("le fichier est rejouable et ne touche à rien d'autre que la contrainte (jamais admin_list_reports)", async () => {
    const db = await prodLikeDb();
    try {
      await db.exec(FIX);
      await db.exec(FIX);
      expect(await fails(() => db.query("insert into reports (category) values ('mineur_suspecte')"))).toBeNull();
      expect(/create (or replace )?function/i.test(FIX.replace(/--.*$/gm, ""))).toBe(false);
    } finally { await db.close(); }
  });
});
