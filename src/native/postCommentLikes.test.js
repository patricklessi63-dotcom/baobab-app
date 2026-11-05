// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-post-comment-likes.sql (SQL-35) sur un SCHÉMA FACTICE (PGlite = PostgreSQL en
// WebAssembly), RLS réellement appliquée (rôle non super-utilisateur). Honnêteté : ce n'est pas la base Supabase.

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-post-comment-likes.sql"), "utf8");
const SQL25 = fs.readFileSync(path.join(process.cwd(), "supabase-block-enforcement-messages-fix.sql"), "utf8");
const IS_BLOCKED_PAIR = SQL25.slice(SQL25.indexOf("create or replace function public.is_blocked_pair"), SQL25.indexOf("revoke all on function public.is_blocked_pair"));

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let db;
const as = async (n) => {
  await db.exec("reset role");
  await db.exec(`select set_config('test.uid', '${n ? U(100 + n) : ""}', false)`);
  if (n) await db.exec("set role authenticated");
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };
let commentId;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, user_id uuid, banned_at timestamptz, suspended_until timestamptz, deletion_requested_at timestamptz);
    create function current_profile_id() returns uuid language sql stable security definer as $$ select id from profiles where user_id = auth.uid() $$;
    create table blocks (from_id uuid, to_id uuid);
    alter table blocks enable row level security;
    create policy blocks_voir_les_miens on blocks for select to authenticated using (from_id = current_profile_id());
    create table posts (id uuid primary key default gen_random_uuid(), author_id uuid);
    create table post_comments (id uuid primary key default gen_random_uuid(), post_id uuid references posts(id) on delete cascade, author_id uuid references profiles(id), body text);
    create table notifications (id serial primary key, recipient_id uuid, actor_id uuid, type text, target_type text, target_id uuid, created_at timestamptz default now());
    alter table notifications add constraint notifications_type_check check (type in ('new_follower','post_liked','post_commented','premium_activated'));
    grant select on profiles, blocks, posts, post_comments, notifications to authenticated;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  `);
  for (let n = 1; n <= 3; n++) await db.query("insert into profiles (id, user_id) values ($1, $2)", [U(n), U(100 + n)]);
  await db.query("insert into posts (id, author_id) values ($1, $2)", [U(50), U(1)]);
  [{ id: commentId }] = await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'mon commentaire') returning id", [U(50), U(2)]);
  await db.exec(IS_BLOCKED_PAIR);
  await db.exec("grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated");
  await db.exec(SQL);
  await db.exec("grant select, insert, delete on post_comment_likes to authenticated");
}, 120000);
afterAll(async () => { await db.close(); });

const likes = () => q("select profile_id from post_comment_likes where comment_id = $1 order by profile_id", [commentId]);
const notifs = () => q("select recipient_id, actor_id, type, target_type, target_id from notifications order by id");

describe("SQL-35 : likes de commentaires", () => {
  it("se rejoue sans erreur ; entièrement ASCII hors commentaires ; la contrainte garde ses types et reçoit comment_liked une fois", async () => {
    await db.exec(SQL);
    const code = SQL.split("\n").filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/--.*$/, ""));
    expect(code.filter((l) => /[^\x00-\x7f]/.test(l))).toEqual([]);
    const [{ def }] = await q("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'notifications_type_check'");
    for (const t of ["new_follower", "post_liked", "post_commented", "premium_activated", "comment_liked"]) expect(def, t).toContain(`'${t}'`);
    expect(def.split("comment_liked").length - 1).toBe(1);
  });

  it("aimer un commentaire : en son nom seulement ; une seule fois ; la notification part vers l'auteur du commentaire", async () => {
    await as(3);
    expect(await fails(() => db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(1)]))).toContain("row-level security");
    expect(await fails(() => db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)]))).toBeNull();
    expect(await fails(() => db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)]))).toContain("duplicate key");
    await as(0);
    expect(await notifs()).toEqual([{ recipient_id: U(2), actor_id: U(3), type: "comment_liked", target_type: "post", target_id: U(50) }]);
  });

  it("aimer son propre commentaire : accepté, aucune notification", async () => {
    await as(0);
    await db.exec("delete from notifications");
    await as(2);
    expect(await fails(() => db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(2)]))).toBeNull();
    await as(0);
    expect(await notifs()).toEqual([]);
  });

  it("retirer son like : autorisé ; celui d'un tiers : sans effet", async () => {
    await as(1);
    const res = await db.query("delete from post_comment_likes where comment_id = $1 and profile_id = $2", [commentId, U(3)]);
    expect(res.affectedRows).toBe(0);
    await as(3);
    const mine = await db.query("delete from post_comment_likes where comment_id = $1 and profile_id = $2", [commentId, U(3)]);
    expect(mine.affectedRows).toBe(1);
    await as(0);
    expect((await likes()).map((l) => l.profile_id)).toEqual([U(2)]);
  });

  it("refusé à un compte suspendu, banni ou en cours de suppression", async () => {
    for (const col of ["banned_at = now()", "suspended_until = now() + interval '1 day'", "deletion_requested_at = now()"]) {
      await as(0);
      await db.exec(`update profiles set ${col} where id = '${U(3)}'`);
      await as(3);
      expect(await fails(() => db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)])), col).toContain("row-level security");
      await as(0);
      await db.exec(`update profiles set banned_at = null, suspended_until = null, deletion_requested_at = null where id = '${U(3)}'`);
    }
  });

  it("refusé entre deux personnes qui se sont bloquées, dans les deux sens ; aucune notification", async () => {
    await as(0);
    await db.exec("delete from notifications");
    for (const [from, to] of [[2, 3], [3, 2]]) {
      await db.exec("delete from blocks");
      await db.exec(`insert into blocks values ('${U(from)}', '${U(to)}')`);
      await as(3);
      expect(await fails(() => db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)])), `${from}->${to}`).toContain("row-level security");
      await as(0);
    }
    await db.exec("delete from blocks");
    expect(await notifs()).toEqual([]);
  });

  it("la personne BLOQUÉE ne voit pas sa ligne de blocage (RLS) et reste pourtant refusée : is_blocked_pair lit blocks sans RLS", async () => {
    await as(0);
    await db.exec("delete from blocks");
    await db.exec(`insert into blocks values ('${U(2)}', '${U(3)}')`); // l'auteur du commentaire a bloqué la personne
    await as(3);
    expect((await q("select count(*)::int as n from blocks"))[0].n).toBe(0); // invisible pour elle
    expect(await fails(() => db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)]))).toContain("row-level security");
    await as(0);
    await db.exec("delete from blocks");
  });

  it("aimer, retirer, aimer de nouveau : une seule notification par jour (pas de bruit chez l'auteur)", async () => {
    await as(0);
    await db.exec("delete from notifications; delete from post_comment_likes");
    for (let i = 0; i < 3; i++) {
      await as(3);
      await db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)]);
      await db.query("delete from post_comment_likes where comment_id = $1 and profile_id = $2", [commentId, U(3)]);
    }
    await as(0);
    expect((await notifs()).map((n) => n.type)).toEqual(["comment_liked"]);
    // un jour plus tard : une nouvelle notification est de nouveau permise
    await db.exec("update notifications set created_at = now() - interval '2 days'");
    await as(3);
    await db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)]);
    await as(0);
    expect((await notifs()).length).toBe(2);
    await db.exec("delete from post_comment_likes");
  });

  it("les compteurs sont lisibles par un compte connecté ; supprimer le commentaire supprime ses likes", async () => {
    await as(3);
    await db.query("insert into post_comment_likes (comment_id, profile_id) values ($1, $2)", [commentId, U(3)]);
    await as(1);
    expect((await q("select count(*)::int as n from post_comment_likes where comment_id = $1", [commentId]))[0].n).toBe(1);
    await as(0);
    await db.query("delete from post_comments where id = $1", [commentId]);
    expect((await q("select count(*)::int as n from post_comment_likes"))[0].n).toBe(0);
  });
});
