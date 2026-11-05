// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-post-threads-mentions.sql (SQL-33) sur un SCHÉMA FACTICE (PGlite = PostgreSQL en
// WebAssembly). Honnêteté : ce n'est pas la base Supabase ; les types de notification de départ ci-dessous
// sont un échantillon (le vrai fichier relit la contrainte réelle et y AJOUTE ses deux types).

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-post-threads-mentions.sql"), "utf8");
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };
const notifs = () => q("select recipient_id, actor_id, type, target_type, target_id from notifications order by id");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create table profiles (id uuid primary key, name text);
    create table blocks (from_id uuid, to_id uuid);
    create table posts (id uuid primary key default gen_random_uuid(), author_id uuid references profiles(id), body text);
    create table post_comments (id uuid primary key default gen_random_uuid(), post_id uuid not null references posts(id) on delete cascade, author_id uuid references profiles(id), body text);
    create table notifications (id serial primary key, recipient_id uuid, actor_id uuid, type text, target_type text, target_id uuid);
    alter table notifications add constraint notifications_type_check check (type in ('new_follower','post_liked','post_commented','premium_activated'));
  `);
  for (let n = 1; n <= 12; n++) await db.query("insert into profiles (id, name) values ($1, $2)", [U(n), `Nom${n}`]);
  await db.query("insert into posts (id, author_id, body) values ($1, $2, 'Bonjour')", [U(50), U(1)]);
  await db.exec(SQL);
}, 120000);
afterAll(async () => { await db.close(); });

describe("SQL-33 : fil de discussion et mentions", () => {
  it("se rejoue sans erreur ; le fichier est entièrement ASCII hors commentaires", async () => {
    await db.exec(SQL);
    const code = SQL.split("\n").filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/--.*$/, ""));
    expect(code.filter((l) => /[^\x00-\x7f]/.test(l))).toEqual([]);
  });

  it("la contrainte des notifications GARDE ses types d'origine et reçoit les deux nouveaux (une seule fois)", async () => {
    const [{ def }] = await q("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'notifications_type_check'");
    for (const t of ["new_follower", "post_liked", "post_commented", "premium_activated", "post_mention", "comment_replied"]) expect(def, t).toContain(`'${t}'`);
    expect(def.split("post_mention").length - 1).toBe(1); // rejeu : pas de doublon
    expect(await fails(() => db.query("insert into notifications (recipient_id, type) values ($1, 'inconnu')", [U(1)]))).toContain("notifications_type_check");
  });

  it("une réponse est rattachée à son commentaire ; répondre à une réponse la rattache à la racine", async () => {
    const [root] = await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'racine') returning id", [U(50), U(2)]);
    const [r1] = await q("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'rep', $3) returning id, parent_id", [U(50), U(3), root.id]);
    expect(r1.parent_id).toBe(root.id);
    const [r2] = await q("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'rep2', $3) returning parent_id", [U(50), U(4), r1.id]);
    expect(r2.parent_id).toBe(root.id);
  });

  it("une réponse à un commentaire d'une AUTRE publication, ou inexistant, est refusée", async () => {
    await q("insert into posts (id, author_id, body) values ($1, $2, 'autre')", [U(51), U(1)]);
    const [other] = await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'ailleurs') returning id", [U(51), U(2)]);
    expect(await fails(() => db.query("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'x', $3)", [U(50), U(3), other.id]))).toContain("THREAD_INVALID");
    expect(await fails(() => db.query("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'x', $3)", [U(50), U(3), U(999)]))).toBeTruthy();
  });

  it("supprimer un commentaire supprime ses réponses (cascade), pas les autres", async () => {
    const [root] = await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'a supprimer') returning id", [U(50), U(2)]);
    await q("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'r', $3)", [U(50), U(3), root.id]);
    await db.query("delete from post_comments where id = $1", [root.id]);
    expect((await q("select count(*)::int as n from post_comments where parent_id = $1", [root.id]))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from post_comments"))[0].n).toBeGreaterThan(0);
  });

  describe("notifications", () => {
    const reset = () => db.exec("delete from notifications");

    it("mentionner quelqu'un dans une publication le notifie (post_mention), jamais soi-même, jamais deux fois", async () => {
      await reset();
      const mentions = JSON.stringify([{ id: U(2), name: "Awa" }, { id: U(2), name: "Awa" }, { id: U(1), name: "Moi" }, { id: "pas-un-uuid", name: "X" }]);
      const [p] = await q("insert into posts (author_id, body, mentions) values ($1, 'Salut @Awa', $2::jsonb) returning id", [U(1), mentions]);
      expect(await notifs()).toEqual([{ recipient_id: U(2), actor_id: U(1), type: "post_mention", target_type: "post", target_id: p.id }]);
    });

    it("mention dans un commentaire : la notification pointe vers la PUBLICATION", async () => {
      await reset();
      await q("insert into post_comments (post_id, author_id, body, mentions) values ($1, $2, 'Hey @Zoe', $3::jsonb)", [U(50), U(2), JSON.stringify([{ id: U(4), name: "Zoe" }])]);
      expect(await notifs()).toEqual([{ recipient_id: U(4), actor_id: U(2), type: "post_mention", target_type: "post", target_id: U(50) }]);
    });

    it("pas de notification entre deux personnes qui se sont bloquées (dans les deux sens)", async () => {
      await reset();
      await db.exec(`insert into blocks values ('${U(4)}', '${U(2)}')`);
      await q("insert into post_comments (post_id, author_id, body, mentions) values ($1, $2, '@Zoe', $3::jsonb)", [U(50), U(2), JSON.stringify([{ id: U(4), name: "Zoe" }])]);
      await db.exec("delete from blocks");
      await db.exec(`insert into blocks values ('${U(2)}', '${U(4)}')`);
      await q("insert into post_comments (post_id, author_id, body, mentions) values ($1, $2, '@Zoe encore', $3::jsonb)", [U(50), U(2), JSON.stringify([{ id: U(4), name: "Zoe" }])]);
      await db.exec("delete from blocks");
      expect(await notifs()).toEqual([]);
    });

    it("une mention vers un profil inexistant est ignorée sans erreur et retirée de la liste enregistrée", async () => {
      await reset();
      const [p] = await q("insert into posts (author_id, body, mentions) values ($1, 'x', $2::jsonb) returning mentions", [U(1), JSON.stringify([{ id: U(777), name: "Fantôme" }])]);
      expect(p.mentions).toEqual([]);
      expect(await notifs()).toEqual([]);
    });

    it("le NOM d'une mention est relu depuis le profil : un client modifié ne peut pas faire passer « @Support » pour quelqu'un d'autre", async () => {
      await reset();
      const dirty = JSON.stringify([{ id: U(2), name: "Support Baobab" }, { id: U(2), name: "Doublon" }, { id: "pas-un-uuid", name: "X" }, { id: U(3) }]);
      const [c] = await q("insert into post_comments (post_id, author_id, body, mentions) values ($1, $2, '@Support Baobab', $3::jsonb) returning mentions", [U(50), U(1), dirty]);
      expect(c.mentions).toEqual([{ id: U(2), name: "Nom2" }, { id: U(3), name: "Nom3" }]);
    });

    it("mentions absentes, nulles ou mal formées : liste vide, jamais d'erreur", async () => {
      for (const m of ["null", "{}", "\"texte\"", "[]"]) {
        const [p] = await q("insert into posts (author_id, body, mentions) values ($1, 'x', $2::jsonb) returning mentions", [U(1), m]);
        expect(p.mentions, m).toEqual([]);
      }
      const [d] = await q("insert into posts (author_id, body) values ($1, 'x') returning mentions", [U(1)]);
      expect(d.mentions).toEqual([]);
    });

    it("plus de cinq mentions : refusé par la base", async () => {
      const six = JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ id: U(5 + i), name: `N${i}` })));
      expect(await fails(() => db.query("insert into posts (author_id, body, mentions) values ($1, 'x', $2::jsonb)", [U(1), six]))).toContain("posts_mentions_check");
      // un objet (et non une liste) est écarté à la normalisation : liste vide, pas d'erreur
    });

    it("répondre au commentaire de quelqu'un le notifie (comment_replied) ; pas si on se répond à soi-même", async () => {
      await reset();
      const [root] = await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'ma question') returning id", [U(50), U(2)]);
      await reset();
      await q("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'ma réponse', $3)", [U(50), U(3), root.id]);
      expect(await notifs()).toEqual([{ recipient_id: U(2), actor_id: U(3), type: "comment_replied", target_type: "post", target_id: U(50) }]);
      await reset();
      await q("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'je me réponds', $3)", [U(50), U(2), root.id]);
      expect(await notifs()).toEqual([]);
    });

    it("réponse qui mentionne déjà l'auteur du commentaire : une seule notification (la mention)", async () => {
      await reset();
      const [root] = await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'q') returning id", [U(50), U(2)]);
      await reset();
      await q("insert into post_comments (post_id, author_id, body, parent_id, mentions) values ($1, $2, '@Awa oui', $3, $4::jsonb)", [U(50), U(3), root.id, JSON.stringify([{ id: U(2), name: "Awa" }])]);
      expect((await notifs()).map((n) => n.type)).toEqual(["post_mention"]);
    });

    it("pas de notification de réponse entre deux personnes qui se sont bloquées", async () => {
      await reset();
      const [root] = await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'q') returning id", [U(50), U(2)]);
      await reset();
      await db.exec(`insert into blocks values ('${U(2)}', '${U(3)}')`);
      await q("insert into post_comments (post_id, author_id, body, parent_id) values ($1, $2, 'r', $3)", [U(50), U(3), root.id]);
      await db.exec("delete from blocks");
      expect(await notifs()).toEqual([]);
    });
  });
});
