// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Valide scripts/verify-prod-sql31-and-statuses.sql (vérification en LECTURE SEULE à lancer après l'exécution en production) :
// sur une base où SQL-31 puis supabase-report-statuses.sql sont installés, chaque contrôle doit valoir true ; sur une base
// où ils ne le sont pas, la requête doit signaler des false (jamais une fausse assurance).
// Schéma repris
// de moderationText.test.js — schéma factice, pas la base Supabase.

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-moderation-text.sql"), "utf8");
const STATUSES = fs.readFileSync(path.join(process.cwd(), "supabase-report-statuses.sql"), "utf8");
const VERIFY = fs.readFileSync(path.join(process.cwd(), "scripts/verify-prod-sql31-and-statuses.sql"), "utf8");
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let db;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select case when current_setting('test.enforce_trust', true) = 'on' and coalesce(current_setting('test.uid', true), '') <> '' then 'authenticated' else 'service_role' end $$;
    create table profiles (
      id uuid primary key, user_id uuid, name text, bio text, created_at timestamptz default now(),
      suspended_until timestamptz, suspend_reason text, banned_at timestamptz, ban_reason text, avatar_url text,
      last_name text, occupation text
    );
    create table platform_roles (profile_id uuid primary key, role text);
    create function current_profile_id() returns uuid language sql stable as $$ select id from profiles where user_id = auth.uid() $$;
    create function platform_role(p uuid) returns text language sql stable as $$ select role from platform_roles where profile_id = p $$;
    create function is_moderator_or_above() returns boolean language sql stable as $$ select platform_role(current_profile_id()) in ('moderator','admin','super_admin') $$;
    create function is_admin_or_above() returns boolean language sql stable as $$ select platform_role(current_profile_id()) in ('admin','super_admin') $$;
    create table messages (id serial primary key, from_id uuid, kind text default 'text', text text);
    create table posts (id uuid primary key default gen_random_uuid(), author_id uuid, body text);
    create table post_media (id uuid primary key default gen_random_uuid(), post_id uuid references posts(id), url text, created_at timestamptz default now());
    create table profile_photos (id bigint generated always as identity primary key, profile_id uuid, url text, created_at timestamptz default now()); -- bigint comme en production
    create table post_comments (id serial primary key, body text);
    create table community_posts (id uuid primary key default gen_random_uuid(), body text, media_url text, author_id uuid, created_at timestamptz default now());
    create table community_comments (id serial primary key, body text);
    create table event_comments (id serial primary key, body text);
    create table stories (id uuid primary key default gen_random_uuid(), profile_id uuid, text text, media_url text, created_at timestamptz default now());
  `);
  // 1 = utilisateur, 2 = modérateur, 3 = administrateur, 4..6 = comptes pour signaler, 7 = très récent
  for (let n = 1; n <= 6; n++) {
    await db.query("insert into profiles (id, user_id, name, created_at) values ($1, $2, $3, now() - interval '30 days')", [U(n), U(100 + n), `P${n}`]);
  }
  await db.query("insert into profiles (id, user_id, name) values ($1, $2, 'Nouveau')", [U(7), U(107)]);
  // Reproduit trg_protect_profile_trust_columns (supabase-profile-trust-columns-protect-fix.sql) : un compte connecté ne peut pas
  // écrire suspended_until / banned_at sans le drapeau posé par une fonction serveur. Armé seulement par test.enforce_trust.
  await db.exec(`
    create function protect_profile_trust_columns() returns trigger language plpgsql as $$
    begin
      if auth.role() = 'authenticated' and coalesce(current_setting('baobab.trust_column_write', true), '') <> 'on'
         and (new.banned_at is distinct from old.banned_at or new.ban_reason is distinct from old.ban_reason
              or new.suspended_until is distinct from old.suspended_until or new.suspend_reason is distinct from old.suspend_reason)
      then raise exception 'Cette colonne ne peut pas etre modifiee directement via l''application'; end if;
      return new;
    end; $$;
    create trigger trg_protect_profile_trust_columns before update on profiles for each row execute function protect_profile_trust_columns();
  `);
  await db.exec(`insert into platform_roles values ('${U(2)}', 'moderator'), ('${U(3)}', 'admin')`);
  // Schéma auth FACTICE (utilisateurs, sessions, jetons) : sert à vérifier la révocation des sessions au bannissement
  // et le blocage de la réinscription. Posé AVANT le fichier SQL (qui y accroche son déclencheur d'inscription).
  await db.exec(`
    create table auth.users (id uuid primary key, email text, banned_until timestamptz);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
    create table auth.refresh_tokens (id serial primary key, user_id varchar, revoked boolean default false);
  `);
  for (let n = 1; n <= 7; n++) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [U(100 + n), `User${n}@Example.com`]);
    await db.query("insert into auth.sessions (user_id) values ($1), ($1)", [U(100 + n)]);
    await db.query("insert into auth.refresh_tokens (user_id) values ($1)", [U(100 + n)]);
  }
  await db.exec(SQL);
}, 120000);
afterAll(async () => { await db.close(); });

describe("script de vérification après exécution en production", () => {
  it("base complète (SQL-31 + statuts) : tous les contrôles valent true", async () => {
    await db.exec("create table if not exists community_reports (id uuid default gen_random_uuid(), status text default 'open', constraint community_reports_status_check check (status = any (array['open','resolved','dismissed'])));");
    await db.exec("create table if not exists event_reports (id uuid default gen_random_uuid(), status text default 'open', constraint event_reports_status_check check (status = any (array['open','resolved','dismissed'])));");
    await db.exec("create table if not exists post_reports (id uuid default gen_random_uuid(), status text, constraint post_reports_status_check check (status = any (array['open','resolved','dismissed'])));");
    await db.exec("create table if not exists info_reports (id uuid default gen_random_uuid(), status text default 'open', constraint info_reports_status_check check (status = any (array['open','resolved','dismissed'])));");
    await db.exec("create table if not exists reports (id bigint generated always as identity primary key, to_id uuid, from_id uuid, category text, reason text, status text default 'open', created_at timestamptz default now());");
    await db.exec("create table if not exists admin_actions (id serial primary key, actor_id uuid, action_type text, metadata jsonb)");
    await db.exec("alter table community_reports add column if not exists target_type text, add column if not exists target_id uuid, add column if not exists from_id uuid, add column if not exists category text, add column if not exists reason text, add column if not exists created_at timestamptz default now()");
    await db.exec("alter table event_reports add column if not exists event_id uuid, add column if not exists from_id uuid, add column if not exists category text, add column if not exists reason text, add column if not exists created_at timestamptz default now()");
    await db.exec("alter table post_reports add column if not exists target_type text, add column if not exists target_id uuid, add column if not exists from_id uuid, add column if not exists category text, add column if not exists reason text, add column if not exists created_at timestamptz default now()");
    await db.exec("alter table info_reports add column if not exists article_id uuid, add column if not exists from_id uuid, add column if not exists category text, add column if not exists reason text, add column if not exists created_at timestamptz default now()");
    await db.exec(STATUSES);
    const rows = (await db.query(VERIFY)).rows;
    const bad = rows.filter((r) => r.ok !== true).map((r) => `${r.controle} => ${r.valeur}`);
    expect(bad).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(14);
  });

  it("un contrôle passe à false quand un élément manque (ici : un déclencheur retiré) — jamais de fausse assurance", async () => {
    await db.exec("drop trigger trg_modban_signup on auth.users");
    const rows = (await db.query(VERIFY)).rows;
    const bad = rows.filter((r) => r.ok !== true).map((r) => r.controle);
    expect(bad.some((c) => /trg_modban_signup/.test(c))).toBe(true);
    await db.exec("create trigger trg_modban_signup before insert on auth.users for each row execute function public.moderation_block_banned_signup()");
  });
});
