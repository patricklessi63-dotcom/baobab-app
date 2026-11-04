// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-client-errors-rate-limit-fix.sql sur un SCHÉMA FACTICE (PGlite) : table
// client_errors avec la policy INSERT ouverte à anon, comme en production. Prouve le défaut (un lot de
// 2000 lignes passe) puis le correctif. Ce n'est PAS la base Supabase ; même scénario joué sur la répétition.

const FIX = fs.readFileSync(path.join(process.cwd(), "supabase-client-errors-rate-limit-fix.sql"), "utf8");
const PROFILE = "10000001-0000-0000-0000-000000000000";
const USER = "00000001-0000-0000-0000-000000000000";

const BASE = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create table public.profiles (id uuid primary key, user_id uuid unique);
  insert into public.profiles values ('${PROFILE}', '${USER}'), ('10000002-0000-0000-0000-000000000000', '00000002-0000-0000-0000-000000000000');
  create table public.client_errors (
    id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
    profile_id uuid references public.profiles(id) on delete set null,
    message text check (message is null or length(message) <= 2000), stack text check (stack is null or length(stack) <= 8000), kind text
  );
  create index on public.client_errors (created_at desc);
  alter table public.client_errors enable row level security;
  create policy client_errors_insert_anyone on public.client_errors for insert to anon, authenticated with check (true);
  grant insert on public.client_errors to anon, authenticated;
`;
let db;
const asRole = async (role, sub, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub || ""}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const insertBulk = (n, role = "anon", sub = "") => asRole(role, sub, async () => {
  try { await db.exec(`insert into public.client_errors (message, stack) select 'e' || g, repeat('x', 8000) from generate_series(1, ${n}) g;`); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message) }; }
});
const count = async () => (await db.query("select count(*)::int n from public.client_errors")).rows[0].n;
const reset = () => db.exec("truncate public.client_errors;");

beforeAll(async () => { db = new PGlite(); await db.exec(BASE); });
afterAll(async () => { await db.close(); });

describe("client_errors — AVANT le correctif (reproduction)", () => {
  it("un visiteur anonyme insère 500 lignes de 8 Ko en une requête", async () => {
    expect((await insertBulk(500)).ok).toBe(true);
    expect(await count()).toBe(500);
    await reset();
  });
});

describe("client_errors — APRÈS supabase-client-errors-rate-limit-fix.sql", () => {
  beforeAll(async () => { await db.exec(FIX); await reset(); });

  it("un lot de 2000 lignes est refusé EN ENTIER (aucune ligne conservée)", async () => {
    const r = await insertBulk(2000);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/limite d'écriture atteinte/);
    expect(await count()).toBe(0);
  });

  it("jusqu'à 30 lignes par minute passent, la 31e est refusée", async () => {
    expect((await insertBulk(30)).ok).toBe(true);
    expect((await insertBulk(1)).ok).toBe(false);
    expect(await count()).toBe(30);
    await reset();
  });

  it("plafond journalier (300) et plafond total (3 000)", async () => {
    await db.exec("insert into public.client_errors (message, created_at) select 'old' || g, now() - interval '2 hours' from generate_series(1, 300) g;");
    expect((await insertBulk(1)).ok).toBe(false); // 300 sur la dernière journée
    await reset();
    await db.exec("insert into public.client_errors (message, created_at) select 'old' || g, now() - interval '3 days' from generate_series(1, 3000) g;");
    expect((await insertBulk(1)).ok).toBe(false); // 3 000 au total
    await reset();
  });

  it("une écriture normale reste possible quand les limites ne sont pas atteintes", async () => {
    expect((await insertBulk(1)).ok).toBe(true);
    await reset();
  });

  it("profile_id : NULL pour un anonyme (même s'il en fournit un), celui de l'appelant pour un compte connecté", async () => {
    await asRole("anon", "", () => db.exec(`insert into public.client_errors (message, profile_id) values ('usurpation', '10000002-0000-0000-0000-000000000000')`));
    await asRole("authenticated", USER, () => db.exec(`insert into public.client_errors (message, profile_id) values ('mine', '10000002-0000-0000-0000-000000000000')`));
    const rows = (await db.query("select message, profile_id from public.client_errors order by message")).rows;
    expect(rows.find((r) => r.message === "usurpation").profile_id).toBeNull();
    expect(rows.find((r) => r.message === "mine").profile_id).toBe(PROFILE);
    await reset();
  });

  it("la fonction n'est exécutable par personne en direct ; le fichier est rejouable", async () => {
    const r = await db.query("select has_function_privilege('anon','public.client_errors_guard()','execute') a, has_function_privilege('authenticated','public.client_errors_guard()','execute') b");
    expect(r.rows[0]).toEqual({ a: false, b: false });
    await db.exec(FIX); await db.exec(FIX);
  });
});
