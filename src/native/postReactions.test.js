// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-post-reactions.sql (SQL-32) sur un SCHÉMA FACTICE (PGlite = PostgreSQL en
// WebAssembly), avec la RLS réellement appliquée (rôle non super-utilisateur). Honnêteté : ce n'est pas la
// base Supabase ; les policies d'insertion / lecture ci-dessous sont des substituts simples.

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-post-reactions.sql"), "utf8");
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const noVariant = (s) => String(s).replace(/️/g, "");
let db;
const as = async (n) => {
  await db.exec("reset role");
  await db.exec(`select set_config('test.uid', '${n ? U(100 + n) : ""}', false)`);
  if (n) await db.exec("set role authenticated");
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, user_id uuid, banned_at timestamptz, suspended_until timestamptz, deletion_requested_at timestamptz);
    create function current_profile_id() returns uuid language sql stable security definer as $$ select id from profiles where user_id = auth.uid() $$;
    create table blocks (from_id uuid, to_id uuid);
    create table posts (id uuid primary key default gen_random_uuid(), author_id uuid);
    create table post_likes (
      id uuid primary key default gen_random_uuid(),
      post_id uuid not null references posts(id) on delete cascade,
      profile_id uuid not null references profiles(id) on delete cascade,
      created_at timestamptz default now(),
      unique (post_id, profile_id)
    );
    alter table post_likes enable row level security;
    create policy lire on post_likes for select to authenticated using (true);
    create policy ecrire on post_likes for insert to authenticated with check (profile_id = current_profile_id());
    create policy retirer on post_likes for delete to authenticated using (profile_id = current_profile_id());
    grant select, insert, update, delete on post_likes to authenticated;
    grant select on profiles, blocks, posts to authenticated;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  `);
  for (let n = 1; n <= 3; n++) await db.query("insert into profiles (id, user_id) values ($1, $2)", [U(n), U(100 + n)]);
  await db.query("insert into posts (id, author_id) values ($1, $2)", [U(50), U(3)]);
  // like existant AVANT la migration
  await db.query("insert into post_likes (post_id, profile_id) values ($1, $2)", [U(50), U(2)]);
  await db.exec(SQL);
}, 120000);
afterAll(async () => { await db.close(); });

describe("SQL-32 : réactions multiples sur post_likes", () => {
  it("se rejoue sans erreur ; les likes existants deviennent des cœurs", async () => {
    await db.exec(SQL);
    const rows = await q("select emoji from post_likes where profile_id = $1", [U(2)]);
    expect(rows).toHaveLength(1);
    expect(noVariant(rows[0].emoji)).toBe("❤");
  });

  it("le fichier est entièrement ASCII hors commentaires (insensible à l'éditeur SQL)", () => {
    const code = SQL.split("\n").filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/--.*$/, ""));
    expect(code.filter((l) => /[^\x00-\x7f]/.test(l))).toEqual([]);
  });

  it("accepte les six réactions, avec ou sans sélecteur de variante ; refuse tout le reste", async () => {
    await as(1);
    for (const e of ["❤️", "❤", "😂", "😍", "👏", "🤝", "😮"]) {
      await db.query("delete from post_likes where profile_id = $1", [U(1)]);
      expect(await fails(() => db.query("insert into post_likes (post_id, profile_id, emoji) values ($1, $2, $3)", [U(50), U(1), e])), e).toBeNull();
    }
    for (const e of ["🔥", "👍", "", "x", "❤️❤️"]) {
      await db.query("delete from post_likes where profile_id = $1", [U(1)]);
      expect(await fails(() => db.query("insert into post_likes (post_id, profile_id, emoji) values ($1, $2, $3)", [U(50), U(1), e])), e).toContain("post_likes_emoji_check");
    }
  });

  it("une seule réaction par personne et par publication (unicité conservée)", async () => {
    await as(1);
    await db.query("delete from post_likes where profile_id = $1", [U(1)]);
    await db.query("insert into post_likes (post_id, profile_id, emoji) values ($1, $2, '😂')", [U(50), U(1)]);
    expect(await fails(() => db.query("insert into post_likes (post_id, profile_id, emoji) values ($1, $2, '👏')", [U(50), U(1)]))).toContain("duplicate key");
  });

  it("changer SA réaction : autorisé ; celle d'un tiers : refusé (RLS), la ligne ne bouge pas", async () => {
    await as(1);
    await db.query("update post_likes set emoji = '👏' where post_id = $1 and profile_id = $2", [U(50), U(1)]);
    expect((await q("select emoji from post_likes where profile_id = $1", [U(1)]))[0].emoji).toBe("👏");
    const res = await db.query("update post_likes set emoji = '😮' where post_id = $1 and profile_id = $2", [U(50), U(2)]);
    expect(res.affectedRows).toBe(0);
    await as(0);
    expect(noVariant((await q("select emoji from post_likes where profile_id = $1", [U(2)]))[0].emoji)).toBe("❤");
  });

  it("changer une réaction est refusé à un compte suspendu, banni ou en cours de suppression", async () => {
    for (const col of ["banned_at = now()", "suspended_until = now() + interval '1 day'", "deletion_requested_at = now()"]) {
      await as(0);
      await db.exec(`update profiles set ${col} where id = '${U(1)}'`);
      await as(1);
      const err = await fails(() => db.query("update post_likes set emoji = '😍' where post_id = $1 and profile_id = $2", [U(50), U(1)]));
      expect(err, col).toContain("row-level security");
      await as(0);
      await db.exec(`update profiles set banned_at = null, suspended_until = null, deletion_requested_at = null where id = '${U(1)}'`);
    }
  });

  it("changer une réaction est refusé entre deux personnes qui se sont bloquées (dans les deux sens)", async () => {
    const attempt = async () => { await as(1); return fails(() => db.query("update post_likes set emoji = '😮' where post_id = $1 and profile_id = $2", [U(50), U(1)])); };
    await as(0);
    await db.exec(`insert into blocks values ('${U(3)}', '${U(1)}')`); // l'auteur a bloqué la personne
    expect(await attempt()).toContain("row-level security");
    await as(0);
    await db.exec("delete from blocks");
    await db.exec(`insert into blocks values ('${U(1)}', '${U(3)}')`); // la personne a bloqué l'auteur
    expect(await attempt()).toContain("row-level security");
    await as(0);
    await db.exec("delete from blocks");
    expect(await attempt()).toBeNull();
  });

  it("sans compte connecté : aucune modification", async () => {
    await db.exec("reset role");
    await db.exec("select set_config('test.uid', '', false)");
    await db.exec("set role authenticated");
    const res = await db.query("update post_likes set emoji = '😮' where post_id = $1", [U(50)]);
    expect(res.affectedRows).toBe(0);
    await db.exec("reset role");
  });
});
