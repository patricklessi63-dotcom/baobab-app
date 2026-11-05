// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-premium-entitlements.sql (SQL-37) sur un SCHÉMA FACTICE (PGlite : PostgreSQL en
// WebAssembly). Honnêteté : ce n'est pas la base Supabase ; is_premium() est recopiée à l'identique de
// supabase-premium.sql et is_admin_or_above() est remplacée par un interrupteur de test.

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-premium-entitlements.sql"), "utf8");

const U = {
  actif: "00000000-0000-0000-0000-000000000001",
  essai: "00000000-0000-0000-0000-000000000002",
  expire: "00000000-0000-0000-0000-000000000003",
  resilie: "00000000-0000-0000-0000-000000000004",
  retard: "00000000-0000-0000-0000-000000000005",
  gratuit: "00000000-0000-0000-0000-000000000006",
  annuel: "00000000-0000-0000-0000-000000000007",
  historique: "00000000-0000-0000-0000-000000000008",
};

const PREREQ = `
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table public.profiles (id uuid primary key);
  create table public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id),
    stripe_customer_id text not null default 'cus',
    plan text check (plan in ('monthly','yearly')),
    status text not null,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create or replace function public.is_premium(p_profile_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from subscriptions
      where profile_id = p_profile_id
        and status in ('active', 'trialing')
        and (current_period_end is null or current_period_end > now())
    );
  $$;
  create or replace function public.is_admin_or_above()
  returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), 'off') = 'on' $$;
`;

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(PREREQ);
  await db.exec(`
    insert into public.profiles values ('${U.actif}'),('${U.essai}'),('${U.expire}'),('${U.resilie}'),('${U.retard}'),('${U.gratuit}'),('${U.annuel}'),('${U.historique}');
    insert into public.subscriptions (profile_id, plan, status, current_period_end, cancel_at_period_end) values
      ('${U.actif}',   'monthly', 'active',   now() + interval '10 days', false),
      ('${U.essai}',   'monthly', 'trialing', now() + interval '5 days',  false),
      ('${U.expire}',  'monthly', 'active',   now() - interval '1 day',   false),
      ('${U.resilie}', 'monthly', 'canceled', now() + interval '10 days', false),
      ('${U.retard}',  'monthly', 'past_due', now() + interval '10 days', false),
      ('${U.annuel}',  'yearly',  'active',   now() + interval '200 days', true),
      -- historique : ancienne ligne résiliée + ligne active actuelle = UN seul profil Premium
      ('${U.historique}', 'monthly', 'canceled', now() - interval '40 days', false),
      ('${U.historique}', 'yearly',  'active',   now() + interval '300 days', false);
    update public.subscriptions set updated_at = now() - interval '2 days' where status = 'canceled' and profile_id = '${U.resilie}';
    update public.subscriptions set created_at = now() - interval '90 days', updated_at = now() - interval '90 days' where profile_id = '${U.expire}';
  `);
  await db.exec(SQL);
});
afterAll(async () => { await db.close(); });

const val = async (sql) => (await db.query(sql)).rows[0].v;

describe("SQL-37 — prérequis", () => {
  it("s'arrête avec un message clair si is_premium() est absente", async () => {
    const empty = new PGlite();
    await empty.exec("create function public.is_admin_or_above() returns boolean language sql as $$ select true $$;");
    await expect(empty.exec(SQL)).rejects.toThrow(/is_premium\(\) introuvable/);
    await empty.close();
  });
});

describe("premium_entitlements", () => {
  it("contient les trois avantages réellement livrés, tous actifs", async () => {
    const { rows } = await db.query("select key, active from public.premium_entitlements order by key");
    expect(rows).toEqual([
      { key: "admirers_reveal", active: true },
      { key: "advanced_filters", active: true },
      { key: "premium_badge", active: true },
    ]);
  });

  it("un compte connecté peut lire mais ni insérer, ni modifier, ni supprimer", async () => {
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select count(*)::int as n from public.premium_entitlements")).rows[0].n).toBe(3);
      await expect(db.exec("insert into public.premium_entitlements (key, label) values ('x_gratuit', 'Pirate')")).rejects.toThrow(/permission denied|row-level security/i);
      await expect(db.exec("update public.premium_entitlements set active = false")).rejects.toThrow(/permission denied|row-level security/i);
      await expect(db.exec("delete from public.premium_entitlements")).rejects.toThrow(/permission denied|row-level security/i);
    } finally {
      await db.exec("reset role");
    }
  });

  it("un visiteur anonyme ne lit rien", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.premium_entitlements")).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec("reset role");
    }
  });

  it("refuse une clé mal formée", async () => {
    await expect(db.exec("insert into public.premium_entitlements (key, label) values ('Mauvaise Clé', 'x')")).rejects.toThrow(/check/i);
  });
});

describe("has_premium_feature()", () => {
  it("vrai pour un abonnement actif, un essai en cours et un profil à historique avec ligne active", async () => {
    expect(await val(`select public.has_premium_feature('${U.actif}', 'advanced_filters') as v`)).toBe(true);
    expect(await val(`select public.has_premium_feature('${U.essai}', 'admirers_reveal') as v`)).toBe(true);
    expect(await val(`select public.has_premium_feature('${U.historique}', 'premium_badge') as v`)).toBe(true);
  });

  it("faux pour un compte gratuit, une période échue, un abonnement résilié ou en retard de paiement", async () => {
    for (const id of [U.gratuit, U.expire, U.resilie, U.retard]) {
      expect(await val(`select public.has_premium_feature('${id}', 'advanced_filters') as v`)).toBe(false);
    }
  });

  it("faux pour une clé inconnue, un avantage désactivé ou un profil nul", async () => {
    expect(await val(`select public.has_premium_feature('${U.actif}', 'inconnu') as v`)).toBe(false);
    expect(await val("select public.has_premium_feature(null, 'advanced_filters') as v")).toBe(false);
    await db.exec("update public.premium_entitlements set active = false where key = 'advanced_filters'");
    expect(await val(`select public.has_premium_feature('${U.actif}', 'advanced_filters') as v`)).toBe(false);
    expect(await val(`select public.has_premium_feature('${U.actif}', 'premium_badge') as v`)).toBe(true);
    await db.exec("update public.premium_entitlements set active = true where key = 'advanced_filters'");
  });

  it("la résiliation retire l'accès sans autre intervention", async () => {
    expect(await val(`select public.has_premium_feature('${U.essai}', 'advanced_filters') as v`)).toBe(true);
    await db.exec(`update public.subscriptions set status = 'canceled' where profile_id = '${U.essai}'`);
    expect(await val(`select public.has_premium_feature('${U.essai}', 'advanced_filters') as v`)).toBe(false);
    await db.exec(`update public.subscriptions set status = 'trialing' where profile_id = '${U.essai}'`);
  });

  it("n'est exécutable que par les comptes connectés", async () => {
    expect(await val("select has_function_privilege('anon', 'public.has_premium_feature(uuid,text)', 'EXECUTE') as v")).toBe(false);
    expect(await val("select has_function_privilege('authenticated', 'public.has_premium_feature(uuid,text)', 'EXECUTE') as v")).toBe(true);
  });
});

describe("admin_premium_stats()", () => {
  it("refuse un compte non administrateur", async () => {
    await db.exec("select set_config('test.admin', 'off', false)");
    await expect(db.query("select public.admin_premium_stats()")).rejects.toThrow(/Non autorise/);
  });

  it("n'est pas exécutable par un visiteur anonyme", async () => {
    expect(await val("select has_function_privilege('anon', 'public.admin_premium_stats()', 'EXECUTE') as v")).toBe(false);
  });

  it("compte des PROFILS distincts avec la même définition que is_premium()", async () => {
    await db.exec("select set_config('test.admin', 'on', false)");
    const s = await val("select public.admin_premium_stats() as v");
    // Premium : actif, essai, annuel (résiliation programmée mais encore valide), historique = 4.
    // Pas Premium : expiré, résilié, en retard, gratuit.
    expect(s.members_total).toBe(8);
    expect(s.premium_total).toBe(4);
    expect(s.trialing).toBe(1);
    expect(s.paid).toBe(3);
    expect(s.monthly).toBe(2);
    expect(s.yearly).toBe(2);
    expect(s.cancel_scheduled).toBe(1);
    expect(s.past_due).toBe(1);
    expect(s.conversion_percent).toBe(50);
    expect(s.canceled_last_30_days).toBe(1);
    // Nouveaux sur 30 jours : six profils (tout sauf « expiré », créé il y a 90 jours).
    expect(s.new_last_30_days).toBe(6);
  });

  it("ne contient aucun montant en dollars (Stripe fait foi pour les revenus)", async () => {
    const s = await val("select public.admin_premium_stats() as v");
    expect(Object.keys(s).some((k) => /revenue|mrr|amount|price/i.test(k))).toBe(false);
  });
});
