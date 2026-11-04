// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-client-errors-rate-limit-v2-fix.sql (SQL-31) sur un SCHÉMA FACTICE (PGlite) :
// on pose d'abord SQL-28 (déjà en production) puis SQL-31, et on prouve les trois défauts corrigés
// (compartiments anonymes / connectés, dédoublonnage, taille). Ce n'est PAS la base Supabase.

const V1 = fs.readFileSync(path.join(process.cwd(), "supabase-client-errors-rate-limit-fix.sql"), "utf8");
const V2 = fs.readFileSync(path.join(process.cwd(), "supabase-client-errors-rate-limit-v2-fix.sql"), "utf8");
const PROFILE = "10000001-0000-0000-0000-000000000000";
const USER = "00000001-0000-0000-0000-000000000000";

const BASE = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create table public.profiles (id uuid primary key, user_id uuid unique);
  insert into public.profiles values ('${PROFILE}', '${USER}');
  create table public.client_errors (
    id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
    profile_id uuid references public.profiles(id) on delete set null,
    message text, stack text, kind text
  );
  create index on public.client_errors (created_at desc);
  alter table public.client_errors enable row level security;
  create policy client_errors_insert_anyone on public.client_errors for insert to anon, authenticated with check (true);
  grant insert on public.client_errors to anon, authenticated;
`;
let db;
const as = async (role, sub, sql) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub || ""}', false);`);
  try { await db.exec(sql); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message) }; } finally { await db.exec("reset role;"); }
};
const insDistinct = (role, sub, n, tag = "e") => as(role, sub, `insert into public.client_errors (message, stack) select '${tag}' || g, 'ligne' || g || E'\\nsuite' from generate_series(1, ${n}) g;`);
const count = async (where = "true") => (await db.query(`select count(*)::int n from public.client_errors where ${where}`)).rows[0].n;
const reset = () => db.exec("truncate public.client_errors;");

beforeAll(async () => { db = new PGlite(); await db.exec(BASE); await db.exec(V1); await db.exec(V2); });
afterAll(async () => { await db.close(); });

describe("client_errors v2 — dédoublonnage", () => {
  it("la même erreur reçue deux fois en 10 minutes n'est enregistrée qu'une fois, sans erreur", async () => {
    expect((await as("anon", "", "insert into public.client_errors (message, stack) values ('boom', E'at x\\nat y')")).ok).toBe(true);
    expect((await as("anon", "", "insert into public.client_errors (message, stack) values ('boom', E'at x\\nautre suite')")).ok).toBe(true);
    expect(await count()).toBe(1);
    await reset();
  });

  it("un lot de 2 000 erreurs IDENTIQUES ne laisse qu'une ligne et ne consomme aucun plafond", async () => {
    expect((await as("anon", "", "insert into public.client_errors (message, stack) select 'meme', 'meme pile' from generate_series(1, 2000)")).ok).toBe(true);
    expect(await count()).toBe(1);
    await reset();
  });

  it("une même erreur après 10 minutes est de nouveau enregistrée ; un message différent aussi", async () => {
    await db.exec("insert into public.client_errors (message, stack, created_at) values ('boom', 'at x', now() - interval '11 minutes')");
    expect((await as("anon", "", "insert into public.client_errors (message, stack) values ('boom', 'at x')")).ok).toBe(true);
    expect((await as("anon", "", "insert into public.client_errors (message, stack) values ('autre', 'at x')")).ok).toBe(true);
    expect(await count()).toBe(3);
    await reset();
  });
});

describe("client_errors v2 — compartiments anonymes / connectés", () => {
  it("anonymes : 20 erreurs distinctes par minute, la 21e est refusée (le lot est annulé en entier)", async () => {
    expect((await insDistinct("anon", "", 20)).ok).toBe(true);
    const r = await insDistinct("anon", "", 1, "z");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/limite d'écriture atteinte/);
    await reset();
    expect((await insDistinct("anon", "", 25)).ok).toBe(false);
    expect(await count()).toBe(0);
  });

  it("un visiteur anonyme qui épuise son plafond N'AVEUGLE PAS les comptes connectés", async () => {
    expect((await insDistinct("anon", "", 20, "a")).ok).toBe(true);
    expect((await insDistinct("anon", "", 1, "b")).ok).toBe(false);
    expect((await insDistinct("authenticated", USER, 1, "c")).ok).toBe(true);
    await reset();
  });

  it("connectés : jusqu'à 120 par minute, la 121e est refusée ; leurs lignes portent leur profile_id", async () => {
    expect((await insDistinct("authenticated", USER, 120)).ok).toBe(true);
    expect((await insDistinct("authenticated", USER, 1, "z")).ok).toBe(false);
    expect(await count(`profile_id = '${PROFILE}'`)).toBe(120);
    await reset();
  });

  it("plafond journalier anonyme : 500 lignes espacées bloquent la suivante", async () => {
    // le réglage de session « request.jwt.claim.sub » survit à `reset role` : on le vide pour que ces lignes de départ soient bien ANONYMES
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec("insert into public.client_errors (message, stack, created_at) select 'old' || g, 's' || g, now() - interval '2 hours' from generate_series(1, 500) g");
    expect((await insDistinct("anon", "", 1, "n")).ok).toBe(false);
    expect((await insDistinct("authenticated", USER, 1, "n")).ok).toBe(true); // l'autre compartiment reste ouvert
    await reset();
  });

  it("profile_id usurpé par un anonyme : forcé à NULL", async () => {
    await as("anon", "", `insert into public.client_errors (message, profile_id) values ('usurpation', '${PROFILE}')`);
    expect((await db.query("select profile_id from public.client_errors where message='usurpation'")).rows[0].profile_id).toBeNull();
    await reset();
  });
});

describe("client_errors v2 — taille et droits", () => {
  it("le plafond de taille (100 Mo, index compris) est bien présent dans la fonction", async () => {
    const r = await db.query("select prosrc from pg_proc where proname = 'client_errors_guard'");
    expect(r.rows[0].prosrc).toMatch(/pg_total_relation_size\('public\.client_errors'\) > 100 \* 1024 \* 1024/);
    expect(r.rows[0].prosrc).toMatch(/dedoublon/);
  });

  it("fonction non exécutable en direct ; fichier rejouable ; retour arrière (SQL-28) rejouable", async () => {
    const r = await db.query("select has_function_privilege('anon','public.client_errors_guard()','execute') a, has_function_privilege('authenticated','public.client_errors_guard()','execute') b");
    expect(r.rows[0]).toEqual({ a: false, b: false });
    await db.exec(V2); await db.exec(V2);
    await db.exec(V1); await db.exec(V2);
  });
});
