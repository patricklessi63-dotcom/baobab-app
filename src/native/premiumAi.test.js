// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-premium-ai.sql (SQL-39) sur un SCHÉMA FACTICE (PGlite), SQL-37 chargé pour de vrai.
// Honnêteté : ce n'est pas la base Supabase. Les contrôles de l'Edge Function elle-même (Deno + Anthropic) sont
// testés dans supabase/functions/_shared/aiPolicy.test.ts (logique pure) ; l'appel réseau n'est pas rejouable ici.

const SQL37 = fs.readFileSync(path.join(process.cwd(), "supabase-premium-entitlements.sql"), "utf8");
const SQL39 = fs.readFileSync(path.join(process.cwd(), "supabase-premium-ai.sql"), "utf8");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const PREREQ = `
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table public.profiles (id uuid primary key);
  create table public.subscriptions (
    id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id),
    stripe_customer_id text not null default 'cus', plan text, status text not null, current_period_end timestamptz,
    cancel_at_period_end boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now());
  create table public.ai_usage (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id), action text not null, created_at timestamptz default now());
  create index idx_ai_usage_profile_time on public.ai_usage(profile_id, created_at);
  create or replace function public.is_premium(p uuid) returns boolean language sql stable security definer set search_path = public as
    $$ select exists (select 1 from subscriptions where profile_id = p and status in ('active','trialing') and (current_period_end is null or current_period_end > now())) $$;
  create or replace function public.is_admin_or_above() returns boolean language sql stable as $$ select false $$;
`;

async function fresh({ withSql37 = true } = {}) {
  const db = new PGlite();
  await db.exec(PREREQ);
  if (withSql37) await db.exec(SQL37);
  return db;
}

describe("SQL-39 — outils d'écriture IA Premium", () => {
  it("s'arrête avec un message clair sans SQL-37, puis sans ai_usage", async () => {
    const noEntitlements = await fresh({ withSql37: false });
    await expect(noEntitlements.exec(SQL39)).rejects.toThrow(/premium_entitlements introuvable/);
    await noEntitlements.close();

    const noUsage = new PGlite();
    await noUsage.exec("create table public.premium_entitlements (key text primary key, label text not null, active boolean not null default true);");
    await expect(noUsage.exec(SQL39)).rejects.toThrow(/ai_usage introuvable/);
    await noUsage.close();
  });

  it("ajoute l'avantage au catalogue et l'index de comptage global", async () => {
    const db = await fresh();
    await db.exec(SQL39);
    expect((await db.query("select key, active from public.premium_entitlements where key = 'ai_writing_tools'")).rows).toEqual([{ key: "ai_writing_tools", active: true }]);
    expect((await db.query("select indexname from pg_indexes where tablename = 'ai_usage' and indexname = 'idx_ai_usage_created_at'")).rows).toHaveLength(1);
    await db.close();
  });

  it("est idempotent et ne réactive pas un avantage coupé par l'administrateur", async () => {
    const db = await fresh();
    await db.exec(SQL39);
    await db.exec("update public.premium_entitlements set active = false where key = 'ai_writing_tools'");
    await db.exec(SQL39);
    expect((await db.query("select active from public.premium_entitlements where key = 'ai_writing_tools'")).rows[0].active).toBe(false);
    await db.close();
  });

  it("has_premium_feature suit l'abonnement et l'interrupteur du catalogue", async () => {
    const db = await fresh();
    await db.exec(`insert into public.profiles values ('${id(1)}'),('${id(2)}');
      insert into public.subscriptions (profile_id, plan, status, current_period_end) values ('${id(1)}', 'monthly', 'active', now() + interval '5 days');`);
    // Avant SQL-39 : clé absente, donc refus pour tout le monde (les outils restent fermés).
    expect((await db.query(`select public.has_premium_feature('${id(1)}', 'ai_writing_tools') as v`)).rows[0].v).toBe(false);
    await db.exec(SQL39);
    expect((await db.query(`select public.has_premium_feature('${id(1)}', 'ai_writing_tools') as v`)).rows[0].v).toBe(true);
    expect((await db.query(`select public.has_premium_feature('${id(2)}', 'ai_writing_tools') as v`)).rows[0].v).toBe(false);
    await db.exec("update public.premium_entitlements set active = false where key = 'ai_writing_tools'");
    expect((await db.query(`select public.has_premium_feature('${id(1)}', 'ai_writing_tools') as v`)).rows[0].v).toBe(false);
    await db.close();
  });
});

describe("hygiène : ai_usage n'est écrite que par la fonction (clé de service)", () => {
  it("un compte connecté peut lire mais ni insérer, ni modifier, ni effacer ; anonyme sans aucun droit", async () => {
    const db = await fresh();
    await db.exec(SQL39);
    const priv = async (role, p) => (await db.query("select has_table_privilege($1, 'public.ai_usage', $2) as ok", [role, p])).rows[0].ok;
    expect(await priv("authenticated", "INSERT")).toBe(false);
    expect(await priv("authenticated", "UPDATE")).toBe(false);
    expect(await priv("authenticated", "DELETE")).toBe(false);
    for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(await priv("anon", p), p).toBe(false);
    await db.close();
  });
});

describe("ai-assist/index.ts — branchement de la politique (garde-fou de dérive)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "supabase/functions/ai-assist/index.ts"), "utf8");
  const policy = fs.readFileSync(path.join(process.cwd(), "supabase/functions/_shared/aiPolicy.ts"), "utf8");

  it("chaque outil Premium est une action connue ET a son prompt", () => {
    const tools = [...policy.matchAll(/PREMIUM_AI_ACTIONS = \[([^\]]+)\]/g)][0][1].match(/"([a-z_]+)"/g).map((s) => s.replaceAll('"', ""));
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      const actionsLine = src.split(/\r?\n/).find((l) => l.startsWith("const ACTIONS"));
      expect(actionsLine).toContain(`"${t}"`);
      expect(src).toContain(`case "${t}":`);
    }
  });

  it("le droit vient de la base (échec fermé) et la décision passe par decideAiAccess avant tout appel au modèle", () => {
    expect(src).toContain('rpc("has_premium_feature"');
    expect(src).toContain('"ai_writing_tools"');
    expect(src.indexOf("decideAiAccess(")).toBeGreaterThan(0);
    expect(src.indexOf("decideAiAccess(")).toBeLessThan(src.indexOf("anthropic.messages.create"));
    expect(src).toMatch(/if \(error\) throw error;/); // un compteur illisible interrompt la requête
  });

  it("le client ne fournit jamais l'état Premium : aucun champ du corps de requête n'est lu pour le droit", () => {
    expect(src).not.toMatch(/body\.(is_?premium|premium)/i);
  });
});
