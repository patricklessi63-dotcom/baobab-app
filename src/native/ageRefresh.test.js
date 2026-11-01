// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-age-refresh-cron.sql sur un SCHÉMA FACTICE (PGlite : PostgreSQL en WebAssembly).
// Honnêteté : ce n'est pas la base Supabase ; pg_cron n'existe pas ici, seule la partie « fonction » du
// fichier (avant le marqueur « >>> PLANIFICATION ») est jouée. La planification est vérifiée à la lecture.

const FULL = fs.readFileSync(path.join(process.cwd(), "supabase-age-refresh-cron.sql"), "utf8");
const FUNCTION_PART = FULL.split("-- >>> PLANIFICATION")[0];

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
    create table public.profiles (id int primary key, birth_date date, age int);
    -- né il y a 30 ans et 1 jour : a 30 ans ; âge stocké périmé (29)
    insert into public.profiles values (1, current_date - interval '30 years' - interval '1 day', 29);
    -- anniversaire des 30 ans demain : a encore 29 ans ; âge stocké trop avancé (30)
    insert into public.profiles values (2, current_date - interval '30 years' + interval '1 day', 30);
    -- déjà correct
    insert into public.profiles values (3, current_date - interval '40 years' - interval '1 day', 40);
    -- pas de date de naissance : intact
    insert into public.profiles values (4, null, 55);
  `);
  await db.exec(FUNCTION_PART);
});
afterAll(async () => { await db.close(); });

describe("refresh_profile_ages()", () => {
  it("corrige les âges périmés (dans les deux sens), ignore les âges justes et les dates vides", async () => {
    const res = await db.query("select public.refresh_profile_ages() as n");
    expect(res.rows[0].n).toBe(2);
    const { rows } = await db.query("select id, age from public.profiles order by id");
    expect(rows).toEqual([{ id: 1, age: 30 }, { id: 2, age: 29 }, { id: 3, age: 40 }, { id: 4, age: 55 }]);
  });

  it("est idempotente : un second passage ne touche aucune ligne", async () => {
    const res = await db.query("select public.refresh_profile_ages() as n");
    expect(res.rows[0].n).toBe(0);
  });

  it("n'est exécutable ni par anon ni par authenticated", async () => {
    const { rows } = await db.query(
      "select has_function_privilege('anon', 'public.refresh_profile_ages()', 'EXECUTE') as a, has_function_privilege('authenticated', 'public.refresh_profile_ages()', 'EXECUTE') as b"
    );
    expect(rows[0]).toEqual({ a: false, b: false });
  });

  it("planifie la tâche quotidienne de 09:00 UTC sous le nom attendu", () => {
    expect(FULL).toMatch(/cron\.schedule\(\s*'baobab-refresh-profile-ages',\s*'0 9 \* \* \*'/);
  });
});
