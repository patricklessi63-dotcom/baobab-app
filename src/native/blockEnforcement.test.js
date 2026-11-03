// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// ============================================================================
// Validation de supabase-block-enforcement-messages-fix.sql sur un SCHÉMA FACTICE.
//
// HONNÊTETÉ : PGlite (PostgreSQL en WebAssembly) avec un schéma reconstitué à la main : rôles,
// auth.uid() lisant request.jwt.claim.sub, profiles, blocks (RLS : chacun ne voit que SES blocages,
// comme en production), messages avec une policy INSERT qui contient la même sous-requête
// NOT EXISTS (… blocks …) que la production, message_reactions, storage.objects minimal.
// Le test reproduit d'abord le défaut (la personne bloquée peut écrire), puis prouve le correctif.
// Ce n'est PAS la base Supabase ; le même scénario a aussi été joué sur le projet de répétition
// (scripts/staging-e2e.mjs).
// ============================================================================

const FIX = fs.readFileSync(path.join(process.cwd(), "supabase-block-enforcement-messages-fix.sql"), "utf8");

const P = (n) => `1000000${n}-0000-0000-0000-000000000000`; // profiles
const U = (n) => `0000000${n}-0000-0000-0000-000000000000`; // auth users
const KEY = [P(1), P(2)].sort().join("__");

const BASE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;

  create table public.profiles (id uuid primary key, user_id uuid unique, name text);
  alter table public.profiles enable row level security;
  create policy profiles_read on public.profiles for select using (true);

  create table public.blocks (id bigint generated always as identity primary key, from_id uuid not null, to_id uuid not null);
  alter table public.blocks enable row level security;
  create policy blocks_select_own on public.blocks for select
    using (auth.uid() = (select user_id from public.profiles where id = blocks.from_id));
  create policy blocks_insert_own on public.blocks for insert
    with check (auth.uid() = (select user_id from public.profiles where id = blocks.from_id));

  create table public.messages (
    id bigint generated always as identity primary key,
    match_key text not null, from_id uuid not null, kind text not null default 'text', text text
  );
  alter table public.messages enable row level security;
  create policy messages_read on public.messages for select
    using ((select id from public.profiles where user_id = auth.uid())::text = any (string_to_array(match_key, '__')));
  -- Même forme que la policy de production : le NOT EXISTS lit « blocks » avec les droits de l'appelant.
  create policy messages_insert on public.messages for insert
    with check (
      auth.uid() = (select user_id from public.profiles where id = messages.from_id)
      and (select id from public.profiles where user_id = auth.uid())::text = any (string_to_array(match_key, '__'))
      and not exists (
        select 1 from unnest(string_to_array(messages.match_key, '__')) other_id
        where other_id::uuid <> messages.from_id
          and exists (select 1 from public.blocks
                      where (blocks.from_id = messages.from_id and blocks.to_id = other_id::uuid)
                         or (blocks.from_id = other_id::uuid and blocks.to_id = messages.from_id))
      )
    );

  create table public.message_reactions (
    message_id bigint not null references public.messages(id) on delete cascade,
    profile_id uuid not null, emoji text not null, primary key (message_id, profile_id, emoji)
  );
  alter table public.message_reactions enable row level security;
  create policy reactions_read on public.message_reactions for select using (true);
  create policy reactions_insert on public.message_reactions for insert
    with check (auth.uid() = (select user_id from public.profiles where id = message_reactions.profile_id));

  create schema storage;
  create table storage.objects (id bigint generated always as identity primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  create policy objects_insert on storage.objects for insert with check (true);

  insert into public.profiles (id, user_id, name) values
    ('${P(1)}', '${U(1)}', 'A'), ('${P(2)}', '${U(2)}', 'B'), ('${P(3)}', '${U(3)}', 'C');
`;

let db;
const as = async (user, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
};
const attempt = async (user, sql, params) => {
  try { await as(user, sql, params); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message) }; }
};
const send = (from, key = KEY) => attempt(U(from), "insert into public.messages (match_key, from_id, text) values ($1, $2, 'salut')", [key, P(from)]);

beforeAll(async () => { db = new PGlite(); await db.exec(BASE); });
afterAll(async () => { await db.close(); });

describe("blocage — AVANT le correctif (reproduction du défaut)", () => {
  it("sans blocage, les deux personnes peuvent écrire", async () => {
    expect((await send(1)).ok).toBe(true);
    expect((await send(2)).ok).toBe(true);
  });

  it("A bloque B : B (bloqué) peut ENCORE écrire — la sous-requête ne voit pas le blocage de A", async () => {
    await as(U(1), "insert into public.blocks (from_id, to_id) values ($1, $2)", [P(1), P(2)]);
    expect((await as(U(2), "select count(*)::int n from public.blocks")).rows[0].n).toBe(0); // B ne voit pas le blocage
    expect((await send(2)).ok).toBe(true); // DÉFAUT reproduit
    expect((await send(1)).ok).toBe(false); // seul le sens « le bloqueur écrit » est refusé
    await db.exec("delete from public.blocks; truncate public.messages restart identity cascade;");
  });
});

describe("blocage — APRÈS supabase-block-enforcement-messages-fix.sql", () => {
  beforeAll(async () => { await db.exec(FIX); });

  it("sans blocage, rien ne change : les deux peuvent écrire", async () => {
    expect((await send(1)).ok).toBe(true);
    expect((await send(2)).ok).toBe(true);
  });

  it("A bloque B : B ne peut plus écrire ; A non plus (blocage symétrique)", async () => {
    await as(U(1), "insert into public.blocks (from_id, to_id) values ($1, $2)", [P(1), P(2)]);
    const b = await send(2);
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/row-level security|messages_block_enforcement_insert/);
    expect((await send(1)).ok).toBe(false);
  });

  it("une autre conversation (A–C) n'est pas affectée par le blocage A–B", async () => {
    expect((await send(1, [P(1), P(3)].sort().join("__"))).ok).toBe(true);
  });

  it("réaction : B bloqué ne peut plus réagir à un message de la conversation", async () => {
    const mid = (await db.query("select id from public.messages order by id limit 1")).rows[0].id;
    expect((await attempt(U(2), "insert into public.message_reactions values ($1, $2, '👍')", [mid, P(2)])).ok).toBe(false);
  });

  it("Storage : B bloqué ne peut plus téléverser dans le dossier chat-media de la conversation ; autre bucket / autre conversation OK", async () => {
    const up = (user, bucket, name) => attempt(U(user), "insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
    expect((await up(2, "chat-media", `${KEY}/photo.png`)).ok).toBe(false);
    expect((await up(2, "post-media", `${KEY}/photo.png`)).ok).toBe(true);
    expect((await up(1, "chat-media", `${[P(1), P(3)].sort().join("__")}/photo.png`)).ok).toBe(true);
  });

  it("déblocage : B peut de nouveau écrire", async () => {
    await as(U(1), "delete from public.blocks where from_id = $1", [P(1)]).catch(() => {});
    await db.exec("delete from public.blocks;");
    expect((await send(2)).ok).toBe(true);
  });

  it("is_blocked_pair : une tierce personne (C) n'apprend rien sur le blocage de A et B", async () => {
    await db.exec(`insert into public.blocks (from_id, to_id) values ('${P(1)}', '${P(2)}')`);
    const asB = (await as(U(2), "select public.is_blocked_pair($1, $2) r", [P(1), P(2)])).rows[0].r;
    const asC = (await as(U(3), "select public.is_blocked_pair($1, $2) r", [P(1), P(2)])).rows[0].r;
    expect(asB).toBe(true);
    expect(asC).toBe(false);
  });

  it("is_blocked_pair : aucun droit d'exécution pour anon", async () => {
    const r = await db.query("select has_function_privilege('anon', 'public.is_blocked_pair(uuid,uuid)', 'execute') a, has_function_privilege('authenticated', 'public.is_blocked_pair(uuid,uuid)', 'execute') b");
    expect(r.rows[0]).toEqual({ a: false, b: true });
  });

  it("le fichier est rejouable (idempotent)", async () => {
    await db.exec(FIX);
    await db.exec(FIX);
  });
});
