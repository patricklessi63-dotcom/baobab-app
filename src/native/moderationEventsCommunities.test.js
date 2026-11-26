// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// SQL-45 (supabase-moderation-events-communities.sql) sur un SCHEMA FACTICE (PGlite = PostgreSQL en
// WebAssembly), apres SQL-31 (supabase-moderation-text.sql) dont il reprend moderation_guard_text().
// Honnetete : ce n'est pas la base Supabase (pas de RLS reelle, un seul role) ; ce test prouve la syntaxe,
// les declencheurs et leur comportement. La verification en production se fait en lecture seule (bas du fichier SQL).

const SQL31 = fs.readFileSync(path.join(process.cwd(), "supabase-moderation-text.sql"), "utf8");
const SQL45 = fs.readFileSync(path.join(process.cwd(), "supabase-moderation-events-communities.sql"), "utf8");

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const BAD = "sale connard";
let db;
const as = (n) => db.exec(`select set_config('test.uid', '${n ? U(100 + n) : ""}', false)`);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };

const EVENT_COLS = ["title", "description", "city", "location"];
const COMMUNITY_COLS = ["name", "description", "city", "rules"];

async function newEvent(fields = {}) {
  const row = { title: "Atelier CV", description: null, city: "Montreal", location: null, ...fields };
  const [{ id }] = await q(
    "insert into events (title, description, city, location) values ($1, $2, $3, $4) returning id",
    [row.title, row.description, row.city, row.location]
  );
  return id;
}
async function newCommunity(fields = {}) {
  const row = { name: "Entraide Quebec", description: null, city: null, rules: null, ...fields };
  const [{ id }] = await q(
    "insert into communities (name, description, city, rules) values ($1, $2, $3, $4) returning id",
    [row.name, row.description, row.city, row.rules]
  );
  return id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
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
    create table profile_photos (id bigint generated always as identity primary key, profile_id uuid, url text, created_at timestamptz default now());
    create table post_comments (id serial primary key, body text);
    create table community_posts (id uuid primary key default gen_random_uuid(), body text, media_url text, author_id uuid, created_at timestamptz default now());
    create table community_comments (id serial primary key, body text);
    create table event_comments (id serial primary key, body text);
    create table stories (id uuid primary key default gen_random_uuid(), profile_id uuid, text text, media_url text, created_at timestamptz default now());
    create table auth.users (id uuid primary key, email text, banned_until timestamptz);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
    create table auth.refresh_tokens (id serial primary key, user_id varchar, revoked boolean default false);
    -- Colonnes reelles (supabase-events.sql + supabase-events-v2.sql ; supabase-communities.sql + -2.sql)
    create table events (
      id uuid primary key default gen_random_uuid(), title text not null, description text,
      city text not null, location text, event_date timestamptz default now() + interval '7 days'
    );
    create table communities (
      id uuid primary key default gen_random_uuid(), name text not null, description text, city text, rules text
    );
  `);
  await db.query("insert into profiles (id, user_id, name, created_at) values ($1, $2, 'P1', now() - interval '30 days')", [U(1), U(101)]);
  await db.exec(SQL31);
  await db.exec(SQL45);
}, 120000);
afterAll(async () => { await db.close(); });

describe("SQL-45 : le fichier s'execute et se rejoue", () => {
  it("pose exactement 8 declencheurs (4 sur events, 4 sur communities), idempotent", async () => {
    await db.exec(SQL45);
    const rows = await q(`select tgrelid::regclass::text as t, count(*)::int as n from pg_trigger
      where (tgname like 'trg_modtext_events_%' or tgname like 'trg_modtext_communities_%') and not tgisinternal
      group by 1 order by 1`);
    expect(rows).toEqual([{ t: "communities", n: 4 }, { t: "events", n: 4 }]);
  });
  it("ne change pas le controle de SQL-31 : toujours 11 declencheurs trg_moderation_* (verify-prod-sql31-and-statuses.sql)", async () => {
    const [{ n }] = await q("select count(*)::int as n from pg_trigger where not tgisinternal and tgname like 'trg\\_moderation\\_%' and tgname not like '%\\_norm'");
    expect(n).toBe(11);
  });
  it("le fichier est entierement ASCII (meme regle que SQL-31)", () => {
    expect([...SQL45].filter((c) => c.charCodeAt(0) > 127)).toEqual([]);
  });
});

describe("evenements", () => {
  it.each(EVENT_COLS)("un texte injurieux dans « %s » est refuse a la creation", async (col) => {
    await as(1);
    const err = await fails(() => newEvent({ [col]: BAD }));
    expect(err).toContain("MODERATION_REFUSED");
    expect((await q("select count(*)::int as n from events where " + col + " = $1", [BAD]))[0].n).toBe(0);
  });

  it.each(EVENT_COLS)("un texte injurieux dans « %s » est refuse a la modification", async (col) => {
    await as(1);
    const id = await newEvent();
    expect(await fails(() => db.query(`update events set ${col} = $1 where id = $2`, [BAD, id]))).toContain("MODERATION_REFUSED");
  });

  it("un evenement normal passe, et le modifier sans toucher au texte deja en base reste possible", async () => {
    await as(0); // ecriture systeme : ancien contenu, anterieur au filtre
    const id = await newEvent({ title: BAD });
    await as(1);
    expect(await fails(() => newEvent({ title: "Un concert a Montreal", description: "Bienvenue a toutes et tous" }))).toBeNull();
    expect(await fails(() => db.query("update events set event_date = now() + interval '9 days', city = 'Laval' where id = $1", [id]))).toBeNull();
  });

  it("filtre coupe (moderation_settings.text_filter_enabled = false) : rien n'est refuse", async () => {
    await as(1);
    await db.exec("update moderation_settings set text_filter_enabled = false where id = 1");
    try {
      expect(await fails(() => newEvent({ title: BAD }))).toBeNull();
    } finally {
      await db.exec("update moderation_settings set text_filter_enabled = true where id = 1");
    }
  });

  it("texte seulement a relire : accepte, et consigne sous la source 'post'", async () => {
    await as(1);
    await db.exec(`delete from moderation_violations where profile_id = '${U(1)}'`);
    expect(await fails(() => newEvent({ description: "quel con" }))).toBeNull();
    const rows = await q("select status, source from moderation_violations where profile_id = $1", [U(1)]);
    expect(rows).toEqual([{ status: "flagged", source: "post" }]);
  });
});

describe("communautes", () => {
  it.each(COMMUNITY_COLS)("un texte injurieux dans « %s » est refuse a la creation", async (col) => {
    await as(1);
    expect(await fails(() => newCommunity({ [col]: BAD }))).toContain("MODERATION_REFUSED");
  });

  it.each(COMMUNITY_COLS)("un texte injurieux dans « %s » est refuse a la modification", async (col) => {
    await as(1);
    const id = await newCommunity();
    expect(await fails(() => db.query(`update communities set ${col} = $1 where id = $2`, [BAD, id]))).toContain("MODERATION_REFUSED");
  });

  it("une communaute normale passe ; texte a relire consigne sous 'community_post'", async () => {
    await as(1);
    await db.exec(`delete from moderation_violations where profile_id = '${U(1)}'`);
    expect(await fails(() => newCommunity({ description: "Entraide pour le logement" }))).toBeNull();
    expect(await fails(() => newCommunity({ rules: "quel con" }))).toBeNull();
    const rows = await q("select status, source from moderation_violations where profile_id = $1", [U(1)]);
    expect(rows).toEqual([{ status: "flagged", source: "community_post" }]);
  });
});

describe("prerequis et retour arriere", () => {
  it("sans SQL-31 : refus clair, aucun declencheur pose", async () => {
    const bare = new PGlite();
    try {
      await bare.exec("create table events (id serial primary key, title text, description text, city text, location text); create table communities (id serial primary key, name text, description text, city text, rules text);");
      let err = null;
      try { await bare.exec(SQL45); } catch (e) { err = String(e.message); }
      expect(err).toContain("prerequis manquant");
      expect(err).toContain("moderation_guard_text");
      const [{ n }] = (await bare.query("select count(*)::int as n from pg_trigger where tgname like 'trg_modtext_%'")).rows;
      expect(n).toBe(0);
    } finally {
      await bare.close();
    }
  });

  // En DERNIER : retire les declencheurs. La section B de supabase-moderation-text-rollback.sql retire aussi ceux
  // de SQL-45, sinon la suppression complete (section C) ne pourrait plus supprimer moderation_guard_text().
  it("la section B du retour arriere de SQL-31 retire aussi les 8 declencheurs de SQL-45", async () => {
    const rollback = fs.readFileSync(path.join(process.cwd(), "supabase-moderation-text-rollback.sql"), "utf8");
    await db.exec(rollback);
    const [{ n }] = await q("select count(*)::int as n from pg_trigger where tgname like 'trg\\_modtext\\_%'");
    expect(n).toBe(0);
    await as(1);
    expect(await fails(() => newEvent({ title: BAD }))).toBeNull();
    expect(await fails(() => db.exec("drop function moderation_guard_text()"))).toBeNull();
  });
});
