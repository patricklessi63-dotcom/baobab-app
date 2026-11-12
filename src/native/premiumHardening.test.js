// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-premium-hardening.sql (SQL-41) sur un SCHÉMA FACTICE (PGlite), SQL-37 et SQL-38
// chargés pour de vrai avant. La RLS de lecture de `posts` est imitée (un auteur « caché » dont les
// publications sont invisibles pour l'appelant, comme un blocage). Honnêteté : ce n'est pas la base Supabase.

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
const SQL37 = read("supabase-premium-entitlements.sql");
// SQL-38 TEL QU'EXÉCUTÉ EN PRODUCTION le 12/11/2026 (copie figée) : SQL-41 doit corriger CET état-là.
const SQL38_PROD = read("src/native/fixtures/sql38-as-executed-in-prod-2026-11-12.sql");
// SQL-38 actuel du dépôt (corrigé à la source) : une installation neuve passe par lui puis par SQL-41.
const SQL38_REPO = read("supabase-premium-collections.sql");
const SQL41 = read("supabase-premium-hardening.sql");

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PREMIUM = id(1), SUSPENDED = id(2), BANNED = id(3), EXPIRED_SUSPENSION = id(4), HIDER = id(5), DELETING = id(6);
const P_VISIBLE = id(100), P_HIDDEN = id(101), P_MISSING = id(999);

const PREREQ = `
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table public.profiles (id uuid primary key, banned_at timestamptz, suspended_until timestamptz, deletion_requested_at timestamptz);
  create table public.posts (id uuid primary key, author_id uuid, body text);
  create table public.ai_usage (id uuid primary key default gen_random_uuid(), profile_id uuid, action text, created_at timestamptz default now());
  create table public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id),
    stripe_customer_id text not null default 'cus',
    plan text, status text not null, current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create or replace function public.is_premium(p_profile_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from subscriptions where profile_id = p_profile_id and status in ('active','trialing')
      and (current_period_end is null or current_period_end > now()));
  $$;
  create or replace function public.is_admin_or_above() returns boolean language sql stable as $$ select false $$;
  create or replace function public.current_profile_id() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  -- Lecture de posts comme en production : les publications d'un auteur « bloqué » sont invisibles.
  alter table public.posts enable row level security;
  grant select on public.posts, public.profiles to authenticated;
  create policy posts_select on public.posts for select to authenticated using (author_id <> '${HIDER}');
  alter table public.ai_usage enable row level security;
  create policy "Lire son propre usage" on public.ai_usage for select to authenticated using (profile_id = public.current_profile_id());
  grant all on public.ai_usage to anon, authenticated;
`;

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(PREREQ);
  await db.exec(`
    insert into public.profiles (id, banned_at, suspended_until, deletion_requested_at) values
      ('${PREMIUM}', null, null, null),
      ('${SUSPENDED}', null, now() + interval '3 days', null),
      ('${BANNED}', now() - interval '1 day', null, null),
      ('${EXPIRED_SUSPENSION}', null, now() - interval '1 day', null),
      ('${DELETING}', null, null, now()),
      ('${HIDER}', null, null, null);
    insert into public.posts values ('${P_VISIBLE}', '${PREMIUM}', 'visible'), ('${P_HIDDEN}', '${HIDER}', 'masquée');
    insert into public.subscriptions (profile_id, plan, status, current_period_end)
      select p, 'monthly', 'active', now() + interval '10 days' from unnest(array['${PREMIUM}','${SUSPENDED}','${BANNED}','${EXPIRED_SUSPENSION}','${DELETING}']::uuid[]) p;
  `);
  await db.exec(SQL37);
  await db.exec(SQL38_PROD);
});
afterAll(async () => { await db.close(); });

async function as(uid, fn) {
  await db.exec(`select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('test.uid', '', false);"); }
}
const mkCollection = (owner, name) => db.query("insert into public.post_collections (owner_id, name) values ($1, $2) returning id", [owner, name]);
const addItem = (cid, post, owner) => db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [cid, post, owner]);

describe("SQL-41 — avant le durcissement (le défaut est reproduit)", () => {
  it("un compte suspendu crée une collection, et on peut ranger une publication masquée / vérifier l'existence", async () => {
    const cid = await as(SUSPENDED, async () => (await mkCollection(SUSPENDED, "Avant")).rows[0].id);
    await as(SUSPENDED, async () => {
      await addItem(cid, P_HIDDEN, SUSPENDED);                                    // réussit : fuite d'existence
      await expect(addItem(cid, P_MISSING, SUSPENDED)).rejects.toThrow(/foreign key/i); // l'inexistante échoue autrement
    });
    await db.exec(`delete from public.post_collections where owner_id = '${SUSPENDED}'`);
  });
  it("ai_usage : un compte connecté peut écrire (privilège de table), anon a des privilèges", async () => {
    const n = (await db.query("select count(*)::int as n from information_schema.role_table_grants where table_name = 'ai_usage' and grantee = 'anon'")).rows[0].n;
    expect(n).toBeGreaterThan(0);
  });
});

describe("SQL-41 — prérequis", () => {
  it("s'arrête avec un message clair si SQL-38 n'est pas passé", async () => {
    const empty = new PGlite();
    await expect(empty.exec(SQL41)).rejects.toThrow(/collections introuvables/);
    await empty.close();
  });
  it("s'arrête si les colonnes de suspension manquent", async () => {
    const other = new PGlite();
    await other.exec("create table public.post_collections (id int); create table public.post_collection_items (id int); create table public.profiles (id uuid, banned_at timestamptz, suspended_until timestamptz);" +
      "create function public.has_premium_feature(uuid, text) returns boolean language sql as $$ select false $$;");
    await expect(other.exec(SQL41)).rejects.toThrow(/banned_at/);
    await other.close();
  });
});

describe("SQL-41 — après le durcissement", () => {
  beforeAll(async () => { await db.exec(SQL41); });

  it("l'exécution se rejoue sans erreur (idempotent)", async () => {
    await db.exec(SQL41);
  });

  it("un abonné normal garde toutes ses fonctions", async () => {
    await as(PREMIUM, async () => {
      const cid = (await mkCollection(PREMIUM, "À relire")).rows[0].id;
      await addItem(cid, P_VISIBLE, PREMIUM);
      expect((await db.query("select count(*)::int as n from public.post_collection_items")).rows[0].n).toBe(1);
    });
  });

  it("un compte suspendu, banni ou en cours de suppression ne crée plus de collection ni ne range plus rien", async () => {
    for (const who of [SUSPENDED, BANNED, DELETING]) {
      await as(who, async () => {
        await expect(mkCollection(who, "Interdite")).rejects.toThrow(/row-level security/i);
      });
    }
    // Même avec une collection créée avant la suspension : l'ajout est refusé.
    await db.exec(`insert into public.post_collections (owner_id, name) values ('${SUSPENDED}', 'Ancienne')`);
    const cid = (await db.query("select id from public.post_collections where owner_id = $1", [SUSPENDED])).rows[0].id;
    await as(SUSPENDED, async () => {
      await expect(addItem(cid, P_VISIBLE, SUSPENDED)).rejects.toThrow(/row-level security/i);
      // Lire, renommer et supprimer ses propres lignes reste permis.
      expect((await db.query("select count(*)::int as n from public.post_collections")).rows[0].n).toBe(1);
      await db.query("update public.post_collections set name = 'Renommée' where id = $1", [cid]);
      await db.query("delete from public.post_collections where id = $1", [cid]);
    });
  });

  it("une suspension terminée n'empêche rien", async () => {
    await as(EXPIRED_SUSPENSION, async () => {
      await mkCollection(EXPIRED_SUSPENSION, "Retour");
    });
  });

  it("publication masquée et publication inexistante donnent le même refus", async () => {
    const cid = (await db.query("select id from public.post_collections where owner_id = $1 limit 1", [PREMIUM])).rows[0].id;
    const errors = [];
    await as(PREMIUM, async () => {
      for (const p of [P_HIDDEN, P_MISSING]) {
        try { await addItem(cid, p, PREMIUM); errors.push("ok"); } catch (e) { errors.push(String(e.message)); }
      }
    });
    expect(errors[0]).toMatch(/row-level security/i);
    expect(errors[1]).toBe(errors[0]);                      // indiscernables
  });

  it("is_account_restricted ne répond que pour soi-même", async () => {
    await as(PREMIUM, async () => {
      expect((await db.query("select public.is_account_restricted($1) as r", [SUSPENDED])).rows[0].r).toBe(false); // pas d'espionnage
      expect((await db.query("select public.is_account_restricted($1) as r", [PREMIUM])).rows[0].r).toBe(false);
    });
    await as(SUSPENDED, async () => {
      expect((await db.query("select public.is_account_restricted($1) as r", [SUSPENDED])).rows[0].r).toBe(true);
    });
    await db.exec("set role anon");
    try { await expect(db.query("select public.is_account_restricted($1)", [SUSPENDED])).rejects.toThrow(/permission denied/i); }
    finally { await db.exec("reset role"); }
  });

  it("ai_usage : anon n'a plus rien, les comptes connectés ne gardent que la lecture", async () => {
    const grants = async (role) => (await db.query(
      "select privilege_type from information_schema.role_table_grants where table_name = 'ai_usage' and grantee = $1 order by 1", [role])).rows.map((r) => r.privilege_type);
    expect(await grants("anon")).toEqual([]);
    expect(await grants("authenticated")).toEqual(["SELECT"]);
    await as(PREMIUM, async () => {
      await expect(db.query("insert into public.ai_usage (profile_id, action) values ($1, 'x')", [PREMIUM])).rejects.toThrow(/permission denied/i);
      await expect(db.query("delete from public.ai_usage")).rejects.toThrow(/permission denied/i);
      expect((await db.query("select count(*)::int as n from public.ai_usage")).rows[0].n).toBe(0);   // la lecture marche
    });
  });
});

describe("SQL-41 — installation neuve (SQL-38 corrigé du dépôt, puis SQL-41)", () => {
  it("les deux fichiers s'enchaînent sans erreur et le garde tient", async () => {
    const fresh = new PGlite();
    await fresh.exec(PREREQ);
    await fresh.exec(`
      insert into public.profiles (id, banned_at, suspended_until, deletion_requested_at) values
        ('${PREMIUM}', null, null, null), ('${DELETING}', null, null, now()), ('${HIDER}', null, null, null);
      insert into public.posts values ('${P_VISIBLE}', '${PREMIUM}', 'visible');
      insert into public.subscriptions (profile_id, plan, status, current_period_end)
        select p, 'monthly', 'active', now() + interval '10 days' from unnest(array['${PREMIUM}','${DELETING}']::uuid[]) p;
    `);
    await fresh.exec(SQL37);
    await fresh.exec(SQL38_REPO);
    await fresh.exec(SQL41);
    await fresh.exec("select set_config('test.uid', '" + DELETING + "', false); set role authenticated;");
    await expect(fresh.query("insert into public.post_collections (owner_id, name) values ($1, 'x')", [DELETING])).rejects.toThrow(/row-level security/i);
    await fresh.exec("reset role; select set_config('test.uid', '" + PREMIUM + "', false); set role authenticated;");
    await fresh.query("insert into public.post_collections (owner_id, name) values ($1, 'ok')", [PREMIUM]);
    await fresh.close();
  });
});
