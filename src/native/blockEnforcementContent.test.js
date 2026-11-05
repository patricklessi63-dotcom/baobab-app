// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// ============================================================================
// Validation de supabase-block-enforcement-content-fix.sql (SQL-36) sur un SCHÉMA FACTICE.
//
// HONNÊTETÉ : PGlite (PostgreSQL en WebAssembly) avec un schéma reconstitué à la main : rôles,
// auth.uid() lisant request.jwt.claim.sub, profiles, blocks (RLS : chacun ne voit que SES blocages,
// comme en production), et pour chacune des six tables une policy INSERT PERMISSIVE qui contient la
// MÊME sous-requête « NOT EXISTS (… blocks …) » à sens unique que la production (relevée le 05/11/2026).
// La fonction is_blocked_pair est extraite telle quelle du fichier SQL-25 (pas recopiée à la main).
// Le test reproduit d'abord le défaut (la personne bloquée peut agir), puis prouve le correctif.
// Ce n'est PAS la base Supabase : à rejouer sur le projet de répétition avant la production.
// ============================================================================

const ROOT = process.cwd();
const FIX = fs.readFileSync(path.join(ROOT, "supabase-block-enforcement-content-fix.sql"), "utf8");
const SQL25 = fs.readFileSync(path.join(ROOT, "supabase-block-enforcement-messages-fix.sql"), "utf8");

// create or replace function public.is_blocked_pair … $$;  +  les trois lignes revoke/grant qui suivent.
const HELPER = (() => {
  const start = SQL25.indexOf("create or replace function public.is_blocked_pair");
  const endMarker = "grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;";
  const end = SQL25.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("is_blocked_pair introuvable dans SQL-25");
  return SQL25.slice(start, end + endMarker.length);
})();

const P = { A: "1000000a-0000-0000-0000-000000000000", B: "1000000b-0000-0000-0000-000000000000", C: "1000000c-0000-0000-0000-000000000000", D: "1000000d-0000-0000-0000-000000000000" };
const U = { A: "0000000a-0000-0000-0000-000000000000", B: "0000000b-0000-0000-0000-000000000000", C: "0000000c-0000-0000-0000-000000000000", D: "0000000d-0000-0000-0000-000000000000" };
const POST = "20000000-0000-0000-0000-000000000001"; // publication de A
const CPOST = "30000000-0000-0000-0000-000000000001"; // publication de communauté de A
const EVENT = "40000000-0000-0000-0000-000000000001"; // événement organisé par A

// Même forme que les policies de production : le NOT EXISTS lit « blocks » avec les droits de l'appelant.
const oneSided = (a, b) => `not exists (select 1 from public.blocks bl where (bl.from_id = ${a} and bl.to_id = ${b}) or (bl.from_id = ${b} and bl.to_id = ${a}))`;
const mine = (col) => `auth.uid() = (select user_id from public.profiles where id = ${col})`;
const me = `(select id from public.profiles where user_id = auth.uid())`;
// RLS de lecture de la production : le contenu est caché à qui a un blocage avec son auteur, DANS LES DEUX SENS
// (celui qui a bloqué voit son propre blocage). C'est ce qui rend NULL la sous-requête « auteur de la publication »
// pour celui qui a bloqué — le trou trouvé à la répétition.
const hidden = (col) => `not exists (select 1 from public.blocks bl where (bl.from_id = ${col} and bl.to_id = ${me}) or (bl.from_id = ${me} and bl.to_id = ${col}))`;

const BASE = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;

  create table public.profiles (id uuid primary key, user_id uuid unique);
  alter table public.profiles enable row level security;
  create policy profiles_read on public.profiles for select using (true);
  insert into public.profiles values ('${P.A}','${U.A}'), ('${P.B}','${U.B}'), ('${P.C}','${U.C}'), ('${P.D}','${U.D}');

  create table public.blocks (id uuid primary key default gen_random_uuid(), from_id uuid not null, to_id uuid not null);
  alter table public.blocks enable row level security;
  create policy blocks_select_own on public.blocks for select using (${mine("blocks.from_id")});

  create table public.posts (id uuid primary key, author_id uuid not null);
  create table public.community_posts (id uuid primary key, author_id uuid not null);
  create table public.events (id uuid primary key, created_by uuid);
  alter table public.posts enable row level security;
  alter table public.community_posts enable row level security;
  alter table public.events enable row level security;
  create policy posts_read on public.posts for select to authenticated using (${hidden("posts.author_id")});
  create policy community_posts_read on public.community_posts for select to authenticated using (${hidden("community_posts.author_id")});
  create policy events_read on public.events for select to authenticated using (${hidden("events.created_by")});
  insert into public.posts values ('${POST}', '${P.A}');
  insert into public.community_posts values ('${CPOST}', '${P.A}');
  insert into public.events values ('${EVENT}', '${P.A}');

  create table public.post_comments (id uuid primary key default gen_random_uuid(), post_id uuid not null, author_id uuid not null, body text);
  create table public.post_likes (id uuid primary key default gen_random_uuid(), post_id uuid not null, profile_id uuid not null);
  create table public.community_comments (id uuid primary key default gen_random_uuid(), post_id uuid not null, author_id uuid not null, body text);
  create table public.community_post_likes (id uuid primary key default gen_random_uuid(), post_id uuid not null, profile_id uuid not null);
  create table public.event_comments (id uuid primary key default gen_random_uuid(), event_id uuid not null, author_id uuid not null, body text);
  create table public.community_invites (id uuid primary key default gen_random_uuid(), invited_by uuid not null, invited_profile_id uuid not null);

  alter table public.post_comments enable row level security;
  alter table public.post_likes enable row level security;
  alter table public.community_comments enable row level security;
  alter table public.community_post_likes enable row level security;
  alter table public.event_comments enable row level security;
  alter table public.community_invites enable row level security;

  create policy pc_insert on public.post_comments for insert with check (${mine("author_id")}
    and not exists (select 1 from public.posts p where p.id = post_comments.post_id and exists (select 1 from public.blocks bl where (bl.from_id = post_comments.author_id and bl.to_id = p.author_id) or (bl.from_id = p.author_id and bl.to_id = post_comments.author_id))));
  create policy pl_insert on public.post_likes for insert with check (${mine("profile_id")}
    and not exists (select 1 from public.posts p where p.id = post_likes.post_id and exists (select 1 from public.blocks bl where (bl.from_id = post_likes.profile_id and bl.to_id = p.author_id) or (bl.from_id = p.author_id and bl.to_id = post_likes.profile_id))));
  create policy cc_insert on public.community_comments for insert with check (${mine("author_id")}
    and not exists (select 1 from public.community_posts p where p.id = community_comments.post_id and exists (select 1 from public.blocks bl where (bl.from_id = community_comments.author_id and bl.to_id = p.author_id) or (bl.from_id = p.author_id and bl.to_id = community_comments.author_id))));
  create policy cpl_insert on public.community_post_likes for insert with check (${mine("profile_id")}
    and not exists (select 1 from public.community_posts p where p.id = community_post_likes.post_id and exists (select 1 from public.blocks bl where (bl.from_id = community_post_likes.profile_id and bl.to_id = p.author_id) or (bl.from_id = p.author_id and bl.to_id = community_post_likes.profile_id))));
  create policy ec_insert on public.event_comments for insert with check (${mine("author_id")}
    and not exists (select 1 from public.events e where e.id = event_comments.event_id and e.created_by is not null and exists (select 1 from public.blocks bl where (bl.from_id = event_comments.author_id and bl.to_id = e.created_by) or (bl.from_id = e.created_by and bl.to_id = event_comments.author_id))));
  create policy ci_insert on public.community_invites for insert with check (${mine("invited_by")}
    and ${oneSided("community_invites.invited_by", "community_invites.invited_profile_id")});

  grant select, insert on all tables in schema public to authenticated;
`;

let db;
async function asUser(who, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U[who]}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const block = (from, to) => db.exec(`insert into public.blocks (from_id, to_id) values ('${P[from]}', '${P[to]}')`);

// Chaque cas : (nom, SQL d'insertion pour l'appelant « who »)
const ACTIONS = {
  "commentaire d'une publication": (who) => `insert into public.post_comments (post_id, author_id, body) values ('${POST}', '${P[who]}', 'salut')`,
  "j'aime d'une publication": (who) => `insert into public.post_likes (post_id, profile_id) values ('${POST}', '${P[who]}')`,
  "commentaire de communauté": (who) => `insert into public.community_comments (post_id, author_id, body) values ('${CPOST}', '${P[who]}', 'salut')`,
  "j'aime de communauté": (who) => `insert into public.community_post_likes (post_id, profile_id) values ('${CPOST}', '${P[who]}')`,
  "commentaire d'événement (organisateur A)": (who) => `insert into public.event_comments (event_id, author_id, body) values ('${EVENT}', '${P[who]}', 'salut')`,
};
const TABLES = ["post_comments", "post_likes", "community_comments", "community_post_likes", "event_comments", "community_invites", "blocks"];
const clean = () => db.exec(TABLES.map((t) => `delete from public.${t};`).join(" "));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  await db.exec(HELPER);
});
afterAll(async () => { await db.close(); });

describe("AVANT SQL-36 : le défaut est reproduit (la personne bloquée peut encore agir)", () => {
  for (const [name, sql] of Object.entries(ACTIONS)) {
    it(`${name} : B, bloqué par A, y arrive`, async () => {
      await clean();
      await block("A", "B");
      await expect(asUser("B", () => db.exec(sql("B")))).resolves.toBeDefined();
    });
  }
  it("invitation de communauté : B (staff) invite A qui l'a bloqué, ça passe", async () => {
    await clean();
    await block("A", "B");
    await expect(asUser("B", () => db.exec(`insert into public.community_invites (invited_by, invited_profile_id) values ('${P.B}', '${P.A}')`))).resolves.toBeDefined();
  });
});

describe("AVANT SQL-36 : le sens « celui qui a BLOQUÉ » passe aussi (sous-requête auteur = NULL sous RLS)", () => {
  for (const [name, sql] of Object.entries(ACTIONS)) {
    it(`${name} : B, qui a bloqué A, y arrive`, async () => {
      await clean();
      await block("B", "A");
      await expect(asUser("B", () => db.exec(sql("B")))).resolves.toBeDefined();
    });
  }
});

describe("APRÈS SQL-36", () => {
  beforeAll(async () => { await db.exec(FIX); });

  for (const [name, sql] of Object.entries(ACTIONS)) {
    it(`${name} : refusé dans les DEUX sens, accepté sans blocage`, async () => {
      await clean();
      // A bloque B : B ne peut plus agir sur le contenu de A.
      await block("A", "B");
      await expect(asUser("B", () => db.exec(sql("B")))).rejects.toThrow(/row-level security|block_enforcement/i);
      // B bloque A (l'autre sens) : B ne peut pas non plus agir sur le contenu de A.
      await clean();
      await block("B", "A");
      await expect(asUser("B", () => db.exec(sql("B")))).rejects.toThrow(/row-level security|block_enforcement/i);
      // Aucun blocage : l'usage normal n'est pas cassé.
      await clean();
      await expect(asUser("B", () => db.exec(sql("B")))).resolves.toBeDefined();
      // Un tiers non concerné par le blocage A/B n'est pas affecté.
      await clean();
      await block("A", "B");
      await expect(asUser("C", () => db.exec(sql("C")))).resolves.toBeDefined();
    });
  }

  it("l'auteur peut agir sur son propre contenu (commenter sa publication, aimer sa publication)", async () => {
    await clean();
    await block("A", "B");
    await expect(asUser("A", () => db.exec(ACTIONS["commentaire d'une publication"]("A")))).resolves.toBeDefined();
    await expect(asUser("A", () => db.exec(ACTIONS["j'aime d'une publication"]("A")))).resolves.toBeDefined();
  });

  it("événement : l'organisateur A a bloqué le commentateur B → refusé ; B, non bloqué par lui, commente un événement d'un autre organisateur", async () => {
    await clean();
    await db.exec(`insert into public.events values ('40000000-0000-0000-0000-000000000002', '${P.D}')`);
    await block("A", "B");
    await expect(asUser("B", () => db.exec(ACTIONS["commentaire d'événement (organisateur A)"]("B")))).rejects.toThrow(/row-level security|block_enforcement/i);
    await expect(asUser("B", () => db.exec(`insert into public.event_comments (event_id, author_id, body) values ('40000000-0000-0000-0000-000000000002', '${P.B}', 'salut')`))).resolves.toBeDefined();
  });

  it("événement sans organisateur connu (created_by nul) : pas de blocage possible, les autres policies décident", async () => {
    await clean();
    await db.exec(`insert into public.events values ('40000000-0000-0000-0000-000000000003', null)`);
    await block("A", "B");
    await expect(asUser("B", () => db.exec(`insert into public.event_comments (event_id, author_id, body) values ('40000000-0000-0000-0000-000000000003', '${P.B}', 'salut')`))).resolves.toBeDefined();
  });

  it("invitation de communauté : staff → invité refusée dans les deux sens, acceptée sans blocage", async () => {
    const invite = (from, to) => db.exec(`insert into public.community_invites (invited_by, invited_profile_id) values ('${P[from]}', '${P[to]}')`);
    await clean();
    await block("A", "B");
    await expect(asUser("B", () => invite("B", "A"))).rejects.toThrow(/row-level security|block_enforcement/i);
    await clean();
    await block("B", "A");
    await expect(asUser("B", () => invite("B", "A"))).rejects.toThrow(/row-level security|block_enforcement/i);
    await clean();
    await expect(asUser("B", () => invite("B", "A"))).resolves.toBeDefined();
    await clean();
    await block("A", "B");
    await expect(asUser("B", () => invite("B", "C"))).resolves.toBeDefined();
  });

  it("publication introuvable : le blocage ne s'applique pas (les autres policies décident)", async () => {
    await clean();
    await block("A", "B");
    await expect(asUser("B", () => db.exec(`insert into public.post_likes (post_id, profile_id) values ('20000000-0000-0000-0000-0000000000ff', '${P.B}')`))).resolves.toBeDefined();
  });

  it("aucun oracle : un tiers ne peut pas déduire le blocage A/B (is_blocked_pair répond faux hors de ses propres paires)", async () => {
    await clean();
    await block("A", "B");
    const r = await asUser("C", () => db.query(`select public.is_blocked_pair('${P.A}', '${P.B}') as b`));
    expect(r.rows[0].b).toBe(false);
  });

  it("les fonctions « cible » ne renvoient qu'un booléen, sont fermées à anon et ne divulguent rien à un tiers", async () => {
    await clean();
    await block("A", "B");
    const asC = await asUser("C", () => db.query(`select public.is_blocked_with_post_author('${P.A}', '${POST}') as p, public.is_blocked_with_community_post_author('${P.A}', '${CPOST}') as c, public.is_blocked_with_event_organizer('${P.A}', '${EVENT}') as e`));
    expect(asC.rows[0]).toEqual({ p: false, c: false, e: false });
    const asB = await asUser("B", () => db.query(`select public.is_blocked_with_post_author('${P.B}', '${POST}') as p`));
    expect(asB.rows[0].p).toBe(true);
    const { rows } = await db.query("select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth, p.prosecdef from pg_proc p where p.proname like 'is_blocked_with_%' order by 1");
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.anon === false && r.auth === true && r.prosecdef === true)).toBe(true);
  });

  it("les six policies sont RESTRICTIVES, nommées clairement, et le fichier est rejouable (idempotent)", async () => {
    await db.exec(FIX); // second passage : drop policy if exists + create
    const { rows } = await db.query("select polname, polpermissive from pg_policy where polname like '%_block_enforcement_insert' order by polname");
    expect(rows.map((r) => r.polname)).toEqual([
      "community_comments_block_enforcement_insert",
      "community_invites_block_enforcement_insert",
      "community_post_likes_block_enforcement_insert",
      "event_comments_block_enforcement_insert",
      "post_comments_block_enforcement_insert",
      "post_likes_block_enforcement_insert",
    ]);
    expect(rows.every((r) => r.polpermissive === false)).toBe(true);
  });
});

describe("garde de prérequis", () => {
  it("s'arrête avec un message clair si is_blocked_pair (SQL-25) n'existe pas", async () => {
    const lone = new PGlite();
    try {
      await lone.exec("create role authenticated nologin; create table public.post_comments (id int, post_id uuid, author_id uuid); create table public.post_likes (id int);");
      await expect(lone.exec(FIX)).rejects.toThrow(/SQL-25/);
    } finally {
      await lone.close();
    }
  });

  it("documente le prérequis, le retour arrière et le statut « non exécuté »", () => {
    expect(FIX).toMatch(/LIVRÉ, NON EXÉCUTÉ/);
    expect(FIX).toMatch(/RETOUR ARRIÈRE/);
    expect(FIX).toMatch(/PRÉREQUIS : SQL-25/);
  });
});
