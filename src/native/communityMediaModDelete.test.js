// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// ============================================================================
// Validation de SQL-43 (supabase-community-media-mod-delete.sql) sur un SCHÉMA FACTICE.
//
// HONNÊTETÉ : PGlite (PostgreSQL en WebAssembly) avec un schéma reconstitué à la main : rôles
// anon/authenticated, auth.uid() lisant request.jwt.claim.sub, storage.buckets/objects minimal
// (colonne owner comme Supabase), storage.foldername identique, et les fonctions
// community_member_role / is_community_mod / current_profile_id recopiées de
// supabase-communities.sql. Le test reproduit d'abord le défaut (un modérateur ne peut pas
// supprimer le fichier de la publication qu'il supprime), puis prouve le correctif et son
// retour arrière. Ce n'est PAS la base Supabase.
// ============================================================================

const FIX = fs.readFileSync(path.join(process.cwd(), "supabase-community-media-mod-delete.sql"), "utf8");
const ROLLBACK = FIX.split("-- Retour arrière")[1].split("\n").filter((l) => l.startsWith("-- ") && !l.startsWith("-- ===")).map((l) => l.slice(3)).join("\n");

const P = (n) => `1000000${n}-0000-0000-0000-000000000000`; // profiles
const U = (n) => `0000000${n}-0000-0000-0000-000000000000`; // auth users
const C1 = "c0000001-0000-0000-0000-000000000000";
const C2 = "c0000002-0000-0000-0000-000000000000";

// 1 = auteur (membre), 2 = modérateur de C1, 3 = simple membre de C1, 4 = étranger, 5 = modérateur de C2 seulement
const BASE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create table public.profiles (id uuid primary key, user_id uuid unique);
  create table public.community_members (community_id uuid, profile_id uuid, role text, primary key (community_id, profile_id));
  create function public.current_profile_id() returns uuid language sql stable security definer set search_path = public
    as $$ select id from profiles where user_id = auth.uid() $$;
  create function public.community_member_role(p_community_id uuid, p_profile_id uuid)
  returns text language sql stable security definer set search_path = public as $$
    select role from community_members where community_id = p_community_id and profile_id = p_profile_id;
  $$;
  create function public.is_community_mod(p_community_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select community_member_role(p_community_id, current_profile_id()) in ('owner','admin','moderator');
  $$;
  grant execute on all functions in schema public to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, public boolean);
  create table storage.objects (id bigint generated always as identity primary key, bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
  create policy "tout lire (test)" on storage.objects for select using (true);
  insert into storage.buckets values ('community-media', false), ('chat-media', false);

  -- Policy d'origine (supabase-communities-3.sql), telle qu'en production.
  create policy "community-media: supprime ses propres fichiers"
  on storage.objects for delete
  using (bucket_id = 'community-media' and owner = auth.uid());

  insert into public.profiles values ('${P(1)}','${U(1)}'),('${P(2)}','${U(2)}'),('${P(3)}','${U(3)}'),('${P(4)}','${U(4)}'),('${P(5)}','${U(5)}');
  insert into public.community_members values
    ('${C1}','${P(1)}','member'),('${C1}','${P(2)}','moderator'),('${C1}','${P(3)}','member'),('${C2}','${P(5)}','owner');
`;

let db;
const del = async (user, name, bucket = "community-media") => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    const r = await db.query("delete from storage.objects where bucket_id = $1 and name = $2 returning id", [bucket, name]);
    return r.rows.length; // RLS : 0 ligne = suppression refusée (pas d'erreur, comme Supabase)
  } finally { await db.exec("reset role;"); }
};
let seq = 0;
const put = async (owner = U(1), folder = C1, bucket = "community-media") => {
  const name = `${folder}/${++seq}.jpg`;
  await db.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, owner]);
  return name;
};

beforeAll(async () => { db = new PGlite(); await db.exec(BASE); });
afterAll(async () => { await db.close(); });

describe("SQL-43 — AVANT (reproduction du défaut)", () => {
  it("un modérateur ne peut pas supprimer le média de la publication d'un autre", async () => {
    expect(await del(U(2), await put())).toBe(0);
  });
  it("l'auteur peut supprimer son propre fichier", async () => {
    expect(await del(U(1), await put())).toBe(1);
  });
});

describe("SQL-43 — APRÈS", () => {
  beforeAll(async () => { await db.exec(FIX); });

  it("le modérateur de la communauté supprime le média d'une publication d'un autre", async () => {
    expect(await del(U(2), await put())).toBe(1);
  });
  it("l'auteur supprime toujours son propre fichier", async () => {
    expect(await del(U(1), await put())).toBe(1);
  });
  it("un simple membre, un étranger, un modérateur d'une AUTRE communauté : refusé", async () => {
    const name = await put();
    expect(await del(U(3), name)).toBe(0);
    expect(await del(U(4), name)).toBe(0);
    expect(await del(U(5), name)).toBe(0);
  });
  it("les autres buckets ne sont pas touchés (modérateur sur chat-media : refusé)", async () => {
    expect(await del(U(2), await put(U(1), C1, "chat-media"), "chat-media")).toBe(0);
  });
  it("un dossier qui n'est pas un UUID ne provoque aucune erreur (refus simple)", async () => {
    expect(await del(U(2), await put(U(1), "pas-un-uuid"))).toBe(0);
    expect(await del(U(1), await put(U(1), "pas-un-uuid"))).toBe(1);
  });
  it("l'ancienne policy a disparu ; une seule policy DELETE sur community-media", async () => {
    const r = await db.query("select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE' order by 1");
    expect(r.rows.map((x) => x.policyname)).toEqual(["community-media: auteur ou moderateur supprime"]);
  });
  it("réservée aux comptes connectés (to authenticated) : le rôle anonyme ne supprime rien", async () => {
    const r = await db.query("select roles::text from pg_policies where policyname = 'community-media: auteur ou moderateur supprime'");
    expect(r.rows[0].roles).toBe("{authenticated}");
    const name = await put();
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '${U(2)}', false);`);
    try {
      expect((await db.query("delete from storage.objects where name = $1 returning id", [name])).rows).toHaveLength(0);
    } finally { await db.exec("reset role;"); }
  });
  it("rejouable (idempotent)", async () => {
    await db.exec(FIX);
    expect(await del(U(2), await put())).toBe(1);
  });
});

describe("SQL-43 — garde-fous et retour arrière", () => {
  it("refuse de s'exécuter si is_community_mod est absente", async () => {
    const empty = new PGlite();
    try {
      await empty.exec("create schema storage; create table storage.buckets (id text primary key); create table storage.objects (id int);");
      await expect(empty.exec(FIX)).rejects.toThrow(/is_community_mod/);
    } finally { await empty.close(); }
  });
  it("le bloc de retour arrière rétablit exactement le comportement d'origine", async () => {
    expect(ROLLBACK).toMatch(/create policy "community-media: supprime ses propres fichiers"/);
    await db.exec(ROLLBACK);
    expect(await del(U(2), await put())).toBe(0);
    expect(await del(U(1), await put())).toBe(1);
  });
});
