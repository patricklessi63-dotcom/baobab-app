// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// ============================================================================
// Validation de supabase-close-read-leaks.sql sur un SCHÉMA FACTICE.
//
// HONNÊTETÉ : ce test s'exécute sur PGlite (PostgreSQL 18 compilé en WebAssembly, en mémoire), avec un
// schéma reconstitué à la main (rôles anon / authenticated / service_role / supabase_auth_admin, fonction
// auth.uid() lisant request.jwt.claim.sub, tables profiles / blocks / profile_photos, quelques fonctions
// SECURITY DEFINER, privilèges par défaut à la manière de Supabase). Ce n'est PAS la base réelle :
// les politiques RLS posées à la main en production, les fonctions inconnues du dépôt, la version de
// PostgreSQL (15/17 chez Supabase) et surtout le comportement de Realtime et de Storage ne sont PAS
// vérifiés ici. Le test prouve que la SYNTAXE est valide et que le COMPORTEMENT décrit est obtenu sur ce
// schéma ; il ne remplace pas la répétition sur un projet Supabase de test (LANCEMENT.md, fiche SQL-22).
// ============================================================================

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-close-read-leaks.sql"), "utf8");

// ---------- extraction des rubriques du fichier ----------
function blockText(id) {
  const re = new RegExp(`^-- BLOC ${id} — `, "m");
  const m = re.exec(SQL);
  if (!m) throw new Error(`bloc ${id} introuvable`);
  const rest = SQL.slice(m.index + 1);
  const next = /^-- BLOC \w+ — /m.exec(rest);
  return next ? SQL.slice(m.index, m.index + 1 + next.index) : SQL.slice(m.index);
}
function fixSql(id) {
  const t = blockText(id);
  const a = t.indexOf(`-- >>> CORRECTIF BLOC ${id}`);
  if (a < 0) throw new Error(`correctif ${id} introuvable`);
  const b = t.indexOf("\n-- <<<", a);
  return t.slice(a + t.slice(a).indexOf("\n") + 1, b);
}
function rollbackSql(id) {
  return blockText(id)
    .split("\n")
    .filter((l) => l.startsWith("--| "))
    .map((l) => l.slice(4))
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
}
// Rubriques de contrôle : on récupère les instructions « --   select ... ; » (3 espaces), multi-lignes.
function sectionSql(id, name) {
  const t = blockText(id);
  const start = t.indexOf(`[${name}]`);
  if (start < 0) return [];
  const after = t.slice(start + 1);
  const nextHdr = /^-- \[[A-ZÉÈÎÔÀ' ]+\]/m.exec(after);
  const body = nextHdr ? after.slice(0, nextHdr.index) : after;
  const out = [];
  let cur = null;
  for (const raw of body.split("\n")) {
    const m = /^--   (.*)$/.exec(raw);
    const line = m ? m[1] : null;
    if (cur === null) {
      if (line && /^(select|with)\b/.test(line)) cur = [line];
      else continue;
    } else {
      if (line === null) { out.push(cur.join("\n")); cur = null; continue; }
      cur.push(line);
    }
    const code = cur[cur.length - 1].replace(/\s--.*$/, "");
    if (/;\s*$/.test(code)) { out.push(cur.join("\n")); cur = null; }
  }
  return out;
}

// ---------- schéma factice ----------
const U = { a: "00000000-0000-0000-0000-0000000000a1", b: "00000000-0000-0000-0000-0000000000b2", c: "00000000-0000-0000-0000-0000000000c3", d: "00000000-0000-0000-0000-0000000000d4", e: "00000000-0000-0000-0000-0000000000e5", f: "00000000-0000-0000-0000-0000000000f6", x: "00000000-0000-0000-0000-0000000000f7" };
const P = { a: "10000000-0000-0000-0000-0000000000a1", b: "10000000-0000-0000-0000-0000000000b2", c: "10000000-0000-0000-0000-0000000000c3", d: "10000000-0000-0000-0000-0000000000d4", e: "10000000-0000-0000-0000-0000000000e5", f: "10000000-0000-0000-0000-0000000000f6" };

const BASE_SCHEMA = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
  grant usage on schema public, auth to anon, authenticated, service_role, supabase_auth_admin;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Privilèges par défaut comme Supabase : tout nouvel objet de public est accordé à anon/authenticated/service_role.
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

  create table public.profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid unique,
    name text,
    age int,
    avatar_url text,
    birth_date date,
    ban_reason text,
    suspend_reason text,
    report_count int not null default 0,
    flagged_for_review boolean not null default false,
    notification_preferences jsonb not null default '{}'::jsonb,
    banned_at timestamptz,
    suspended_until timestamptz,
    deletion_requested_at timestamptz,
    onboarding_completed_at timestamptz,
    created_at timestamptz default now()
  );
  alter table public.profiles enable row level security;
  create policy "Lecture des profils par les utilisateurs connectes" on public.profiles for select to authenticated using (true);
  create policy "maj de son profil" on public.profiles for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy "creation de son profil" on public.profiles for insert to authenticated with check (user_id = auth.uid());

  create table public.blocks (
    id uuid primary key default gen_random_uuid(),
    from_id uuid not null references public.profiles(id) on delete cascade,
    to_id uuid not null references public.profiles(id) on delete cascade,
    unique (from_id, to_id)
  );
  alter table public.blocks enable row level security;
  create policy "lit ses propres blocages" on public.blocks for select
    using (auth.uid() = (select user_id from public.profiles where id = blocks.from_id));
  create table public.passes (id uuid primary key default gen_random_uuid(), from_id uuid, to_id uuid);
  create table public.likes (id uuid primary key default gen_random_uuid(), from_id uuid, to_id uuid);
  create table public.follows (id uuid primary key default gen_random_uuid(), from_id uuid, to_id uuid);
  create table public.favorites (id uuid primary key default gen_random_uuid(), from_id uuid, to_id uuid);
  alter table public.blocks replica identity full;
  alter table public.passes replica identity full;
  alter table public.likes replica identity full;
  alter table public.follows replica identity full;
  alter table public.favorites replica identity full;

  -- Trigger de protection (comme trg_protect_profile_trust_columns) : lit OLD/NEW en tant qu'invoker.
  create function public.protect_trust() returns trigger language plpgsql as $$
  begin
    if new.report_count is distinct from old.report_count and auth.uid() is not null then
      raise exception 'colonne protegee';
    end if;
    return new;
  end $$;
  create trigger trg_protect before update on public.profiles for each row execute function public.protect_trust();

  -- Un profil par compte + cas particuliers.
  insert into public.profiles (id, user_id, name, age, birth_date, ban_reason, report_count, notification_preferences, onboarding_completed_at) values
    ('${P.a}', '${U.a}', 'Alice', 30, '1996-01-02', 'secret-a', 0, '{"likes":true}', now()),
    ('${P.b}', '${U.b}', 'Bob', 31, '1995-03-04', null, 2, '{}', now()),
    ('${P.c}', '${U.c}', 'Chloe', 28, '1998-05-06', null, 0, '{}', now());
  insert into public.profiles (id, user_id, name, age, birth_date, banned_at, ban_reason) values ('${P.d}', '${U.d}', 'Dan (banni)', 40, '1980-01-01', now(), 'spam');
  insert into public.profiles (id, user_id, name, age, birth_date, suspended_until) values ('${P.e}', '${U.e}', 'Eve (suspendue)', 33, '1993-01-01', now() + interval '3 days');
  insert into public.profiles (id, user_id, name, age, birth_date, deletion_requested_at) values ('${P.f}', '${U.f}', 'Fay (suppression)', 35, '1991-01-01', now());
`;

// État « prod » supposé de profile_photos : politiques posées à la main, lecture ouverte à tous.
const LEAKY_PHOTOS = `
  create table public.profile_photos (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    url text not null,
    position integer not null default 0,
    created_at timestamptz not null default now()
  );
  alter table public.profile_photos enable row level security;
  create policy "Lecture publique" on public.profile_photos for select using (true);
  create policy "ins" on public.profile_photos for insert with check (auth.uid() = (select user_id from public.profiles where id = profile_id));
  create policy "Un utilisateur reordonne ses propres photos" on public.profile_photos for update
    using (auth.uid() = (select user_id from public.profiles where id = profile_photos.profile_id))
    with check (auth.uid() = (select user_id from public.profiles where id = profile_photos.profile_id));
  create policy "del trop large" on public.profile_photos for delete using (true);
  create policy "tout pour tous" on public.profile_photos as permissive for all to public using (true) with check (true);
  insert into public.profile_photos (id, profile_id, url, position) values
    ('20000000-0000-0000-0000-0000000000a1', '${P.a}', 'https://x/storage/v1/object/public/avatars/a/photo-1.jpg', 0),
    ('20000000-0000-0000-0000-0000000000a2', '${P.a}', 'https://x/storage/v1/object/public/avatars/a/photo-2.jpg', 1),
    ('20000000-0000-0000-0000-0000000000b1', '${P.b}', 'https://x/storage/v1/object/public/avatars/b/photo-1.jpg', 0),
    ('20000000-0000-0000-0000-0000000000c1', '${P.c}', 'https://x/storage/v1/object/public/avatars/c/photo-1.jpg', 0),
    ('20000000-0000-0000-0000-0000000000d1', '${P.d}', 'https://x/storage/v1/object/public/avatars/d/photo-1.jpg', 0),
    ('20000000-0000-0000-0000-0000000000e1', '${P.e}', 'https://x/storage/v1/object/public/avatars/e/photo-1.jpg', 0),
    ('20000000-0000-0000-0000-0000000000f1', '${P.f}', 'https://x/storage/v1/object/public/avatars/f/photo-1.jpg', 0);
`;

// Fonctions SECURITY DEFINER du schéma factice (reflet des cas réels).
const FUNCTIONS = `
  create function public.public_user_count() returns bigint language sql stable security definer set search_path = public
    as $$ select count(*) from public.profiles $$;
  create function public.admin_dashboard_stats() returns int language sql stable security definer set search_path = public
    as $$ select 1 $$;
  create function public.get_my_likers() returns int language sql stable security definer set search_path = public
    as $$ select 2 $$;
  create function public.legacy_no_search_path() returns int language sql stable security definer
    as $$ select count(*)::int from profiles $$;
  create function public.check_beta_whitelist(event jsonb) returns jsonb language sql security definer set search_path = public
    as $$ select '{}'::jsonb $$;
  revoke all on function public.check_beta_whitelist(jsonb) from public;
  revoke all on function public.check_beta_whitelist(jsonb) from anon, authenticated;
  grant execute on function public.check_beta_whitelist(jsonb) to supabase_auth_admin;
  create function public.send_event_reminders() returns int language sql security definer set search_path = public
    as $$ select 3 $$;
  revoke all on function public.send_event_reminders() from public;
  revoke all on function public.send_event_reminders() from anon, authenticated;
  -- droit tenu UNIQUEMENT de PUBLIC (cas « ni grant ni revoke » : fréquent)
  create function public.only_via_public() returns int language sql security definer set search_path = public
    as $$ select 4 $$;
  revoke all on function public.only_via_public() from anon, authenticated, service_role;
  create procedure public.proc_definer() language sql security definer as $$ select 1 $$;
  -- fonction INVOKER : hors périmètre du bloc 2 (reste inchangée)
  create function public.invoker_fn() returns int language sql stable as $$ select 5 $$;
`;

const dbs = [];
async function freshDb({ photos = true, functions = true } = {}) {
  const db = new PGlite();
  dbs.push(db);
  await db.exec(BASE_SCHEMA);
  if (photos) await db.exec(LEAKY_PHOTOS);
  if (functions) await db.exec(FUNCTIONS);
  return db;
}
afterEach(async () => {
  while (dbs.length) {
    const db = dbs.pop();
    try { await db.close(); } catch { /* déjà fermée */ }
  }
});

async function as(db, role, sub, fn) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub || ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
// Retourne { rows } ou { error: code }.
async function tryQ(db, role, sub, sql, params) {
  return as(db, role, sub, async () => {
    try {
      const r = await db.query(sql, params);
      return { rows: r.rows, count: r.affectedRows };
    } catch (e) {
      return { error: e.code || e.message, message: e.message };
    }
  });
}
const photoUrls = async (db, role, sub) => {
  const r = await tryQ(db, role, sub, "select url from public.profile_photos order by url");
  return r.error ? r : r.rows.map((x) => x.url.replace(/^.*avatars\//, ""));
};
const runAll = async (db, statements) => { for (const s of statements) await db.exec(s); };

describe("supabase-close-read-leaks.sql — structure du fichier", () => {
  it("contient tous les blocs avec leurs six rubriques", () => {
    for (const id of ["1", "1B", "2", "3A", "3B", "4A", "4B"]) {
      const t = blockText(id);
      for (const r of ["[OBJECTIF]", "[PRÉ-CONTRÔLE]", "[CORRECTIF]", "[CONTRÔLE APRÈS]", "[IMPACT APP]", "[RETOUR ARRIÈRE]"]) {
        expect(t, `bloc ${id} sans ${r}`).toContain(r);
      }
      expect(fixSql(id).trim().length).toBeGreaterThan(20);
      expect(rollbackSql(id).trim().length, `bloc ${id} sans retour arrière exécutable`).toBeGreaterThan(10);
    }
  });

  it("n'écrit dans aucun fichier SQL existant et ne contient aucun secret", () => {
    expect(SQL).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    expect(SQL).not.toMatch(/sk_(live|test)_/);
    expect(SQL).not.toMatch(/service_role_key/i);
  });
});

describe("Bloc 1 — profile_photos (schéma factice)", () => {
  it("état de départ : un anonyme lit tout (la fuite C2 est reproduite)", async () => {
    const db = await freshDb();
    expect((await photoUrls(db, "anon")).length).toBe(7);
  });

  it("après le correctif : un anonyme ne lit plus rien (permission refusée), ni n'écrit", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    expect((await tryQ(db, "anon", null, "select count(*) from public.profile_photos")).error).toBe("42501");
    expect((await tryQ(db, "anon", null, "insert into public.profile_photos (profile_id, url) values ($1, 'x')", [P.a])).error).toBe("42501");
    expect((await tryQ(db, "anon", null, "delete from public.profile_photos")).error).toBe("42501");
    const { rows } = await db.query("select has_table_privilege('anon','public.profile_photos','SELECT') as s, has_function_privilege('anon','public.can_view_profile_photos(uuid)','EXECUTE') as f");
    expect(rows[0]).toEqual({ s: false, f: false });
  });

  it("remplace toutes les politiques inconnues par exactement quatre politiques « authenticated »", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    const { rows } = await db.query("select policyname, cmd, roles::text as roles from pg_policies where tablename = 'profile_photos' order by cmd");
    expect(rows.map((r) => r.cmd)).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    for (const r of rows) expect(r.roles).toBe("{authenticated}");
    const rls = await db.query("select relrowsecurity from pg_class where oid = 'public.profile_photos'::regclass");
    expect(rls.rows[0].relrowsecurity).toBe(true);
  });

  it("active la RLS quand elle était désactivée (cas « table créée à la main sans RLS »)", async () => {
    const db = await freshDb();
    await db.exec("alter table public.profile_photos disable row level security");
    expect((await photoUrls(db, "anon")).length).toBe(7);
    await db.exec(fixSql("1"));
    expect((await tryQ(db, "anon", null, "select 1 from public.profile_photos")).error).toBe("42501");
    expect((await tryQ(db, "authenticated", U.a, "select 1 from public.profile_photos")).rows.length).toBeGreaterThan(0);
  });

  it("crée la table si elle n'existe pas (répétition sur un projet rejoué depuis le dépôt)", async () => {
    const db = await freshDb({ photos: false });
    await db.exec(fixSql("1"));
    const ins = await tryQ(db, "authenticated", U.a, "insert into public.profile_photos (profile_id, url, position) values ($1, 'a/p.jpg', 0) returning id", [P.a]);
    expect(ins.error).toBeUndefined();
    expect((await tryQ(db, "anon", null, "select 1 from public.profile_photos")).error).toBe("42501");
  });

  it("un connecté voit les photos d'un profil visible, et les siennes", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    const urls = await photoUrls(db, "authenticated", U.a);
    expect(urls).toEqual(["a/photo-1.jpg", "a/photo-2.jpg", "b/photo-1.jpg", "c/photo-1.jpg"]);
  });

  it("masque les galeries des profils bannis, suspendus ou en suppression", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    const urls = await photoUrls(db, "authenticated", U.b);
    expect(urls.some((u) => u.startsWith("d/"))).toBe(false);
    expect(urls.some((u) => u.startsWith("e/"))).toBe(false);
    expect(urls.some((u) => u.startsWith("f/"))).toBe(false);
    // ... mais le propriétaire suspendu voit toujours les siennes
    expect(await photoUrls(db, "authenticated", U.e)).toContain("e/photo-1.jpg");
    // une suspension échue ne masque plus
    await db.exec("update public.profiles set suspended_until = now() - interval '1 day' where id = '" + P.e + "'");
    expect(await photoUrls(db, "authenticated", U.b)).toContain("e/photo-1.jpg");
  });

  it("ne montre pas les photos d'un profil qui m'a bloqué, ni celles d'un profil que j'ai bloqué", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    // C a bloqué A : A ne voit plus C ; C ne voit plus A (symétrique)
    await db.exec(`insert into public.blocks (from_id, to_id) values ('${P.c}', '${P.a}')`);
    expect((await photoUrls(db, "authenticated", U.a)).some((u) => u.startsWith("c/"))).toBe(false);
    expect((await photoUrls(db, "authenticated", U.c)).some((u) => u.startsWith("a/"))).toBe(false);
    // B n'est pas concerné : voit encore A et C
    const b = await photoUrls(db, "authenticated", U.b);
    expect(b).toContain("a/photo-1.jpg");
    expect(b).toContain("c/photo-1.jpg");
    // A bloque B : A ne voit plus B
    await db.exec(`insert into public.blocks (from_id, to_id) values ('${P.a}', '${P.b}')`);
    expect((await photoUrls(db, "authenticated", U.a)).some((u) => u.startsWith("b/"))).toBe(false);
  });

  it("le propriétaire ajoute, modifie, réordonne (upsert) et supprime les siennes", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    const ins = await tryQ(db, "authenticated", U.a, "insert into public.profile_photos (profile_id, url, position) values ($1, 'a/new.jpg', 5) returning id", [P.a]);
    expect(ins.error).toBeUndefined();
    const id = ins.rows[0].id;
    const upd = await tryQ(db, "authenticated", U.a, "update public.profile_photos set position = 0 where id = $1", [id]);
    expect(upd.error).toBeUndefined();
    expect(upd.count).toBe(1);
    // upsert tel que persistPhotoOrder (App.jsx) : id + profile_id + url + position
    const ups = await tryQ(
      db, "authenticated", U.a,
      "insert into public.profile_photos (id, profile_id, url, position) values ($1, $2, 'a/new.jpg', 3) on conflict (id) do update set profile_id = excluded.profile_id, url = excluded.url, position = excluded.position returning position",
      [id, P.a]
    );
    expect(ups.error).toBeUndefined();
    expect(ups.rows[0].position).toBe(3);
    const del = await tryQ(db, "authenticated", U.a, "delete from public.profile_photos where id = $1", [id]);
    expect(del.error).toBeUndefined();
    expect(del.count).toBe(1);
  });

  it("un compte ne peut ni ajouter, ni modifier, ni supprimer les photos d'autrui", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    // ajout au nom de B par A : refusé par la politique
    const ins = await tryQ(db, "authenticated", U.a, "insert into public.profile_photos (profile_id, url) values ($1, 'evil.jpg')", [P.b]);
    expect(ins.error).toBe("42501");
    // modification / suppression de la photo de B par A : 0 ligne touchée
    const upd = await tryQ(db, "authenticated", U.a, "update public.profile_photos set url = 'pwn' where id = '20000000-0000-0000-0000-0000000000b1'");
    expect(upd.count).toBe(0);
    const del = await tryQ(db, "authenticated", U.a, "delete from public.profile_photos where id = '20000000-0000-0000-0000-0000000000b1'");
    expect(del.count).toBe(0);
    // un upsert qui tente de prendre la ligne de B est refusé
    const ups = await tryQ(
      db, "authenticated", U.a,
      "insert into public.profile_photos (id, profile_id, url) values ('20000000-0000-0000-0000-0000000000b1', $1, 'pwn') on conflict (id) do update set url = excluded.url",
      [P.a]
    );
    expect(ups.error).toBeDefined();
    const check = await db.query("select url from public.profile_photos where id = '20000000-0000-0000-0000-0000000000b1'");
    expect(check.rows[0].url).toContain("b/photo-1.jpg");
  });

  it("est idempotent (deux exécutions = même état)", async () => {
    const db = await freshDb();
    await db.exec(fixSql("1"));
    const q = "select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename = 'profile_photos' order by cmd, policyname";
    const first = (await db.query(q)).rows;
    await db.exec(fixSql("1"));
    expect((await db.query(q)).rows).toEqual(first);
    expect((await photoUrls(db, "authenticated", U.a)).length).toBe(4);
  });

  it("le retour arrière (sauvegarde du pré-contrôle 1.f + lignes --|) restaure exactement l'état d'avant", async () => {
    const db = await freshDb();
    const q = "select policyname, cmd, permissive, roles::text, qual, with_check from pg_policies where tablename = 'profile_photos' order by cmd, policyname";
    const before = (await db.query(q)).rows;
    // sauvegarde : requête 1.f du fichier lui-même
    const backupQuery = sectionSql("1", "PRÉ-CONTRÔLE").find((s) => s.includes("sql_de_sauvegarde"));
    expect(backupQuery).toBeTruthy();
    const backup = (await db.query(backupQuery)).rows.map((r) => r.sql_de_sauvegarde);
    expect(backup.length).toBe(5);
    await db.exec(fixSql("1"));
    expect((await tryQ(db, "anon", null, "select 1 from public.profile_photos")).error).toBe("42501");
    // retour arrière : lignes --| du fichier, puis rejeu de la sauvegarde, puis rétablissement du droit anon d'origine
    await db.exec(rollbackSql("1"));
    for (const s of backup) await db.exec(s);
    await db.exec("grant select, insert, update, delete on public.profile_photos to anon");
    expect((await db.query(q)).rows).toEqual(before);
    expect((await photoUrls(db, "anon")).length).toBe(7);
  });

  it("les requêtes de pré-contrôle et de contrôle du bloc s'exécutent sans erreur", async () => {
    const db = await freshDb();
    const pre = sectionSql("1", "PRÉ-CONTRÔLE");
    expect(pre.length).toBeGreaterThanOrEqual(6);
    for (const s of pre) await db.exec(s);
    await db.exec(fixSql("1"));
    const after = sectionSql("1", "CONTRÔLE APRÈS");
    expect(after.length).toBeGreaterThanOrEqual(4);
    for (const s of after) await db.exec(s);
  });
});

describe("Bloc 1B — bucket avatars privé (optionnel, armé)", () => {
  it("refuse de s'exécuter sans armement, s'exécute avec, et se défait", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await expect(db.exec(fixSql("1B"))).rejects.toThrow(/non armé/);
    expect((await db.query("select public from storage.buckets where id = 'avatars'")).rows[0].public).toBe(true);
    await db.exec("set baobab.arm = 'bloc1b';\n" + fixSql("1B"));
    expect((await db.query("select public from storage.buckets where id = 'avatars'")).rows[0].public).toBe(false);
    await db.exec(rollbackSql("1B"));
    expect((await db.query("select public from storage.buckets where id = 'avatars'")).rows[0].public).toBe(true);
  });
});

describe("Bloc 2 — EXECUTE des fonctions SECURITY DEFINER (schéma factice)", () => {
  const canExec = async (db, role, sig) =>
    (await db.query("select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok", [role, sig])).rows[0].ok;
  const notAnonNames = async (db) =>
    (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`)).rows.map((r) => r.proname);

  it("état de départ : plusieurs fonctions SECURITY DEFINER sont appelables par anon (I3 reproduit)", async () => {
    const db = await freshDb();
    const names = await notAnonNames(db);
    expect(names).toEqual(expect.arrayContaining(["admin_dashboard_stats", "get_my_likers", "legacy_no_search_path", "only_via_public", "public_user_count"]));
    const r = await tryQ(db, "anon", null, "select public.admin_dashboard_stats()");
    expect(r.error).toBeUndefined(); // atteint son corps
  });

  it("après le correctif : seule la liste blanche (public_user_count) reste appelable par anon", async () => {
    const db = await freshDb();
    await db.exec(fixSql("2"));
    expect(await notAnonNames(db)).toEqual(["public_user_count"]);
    expect((await tryQ(db, "anon", null, "select public.public_user_count()")).error).toBeUndefined();
    expect((await tryQ(db, "anon", null, "select public.admin_dashboard_stats()")).error).toBe("42501");
    expect((await tryQ(db, "anon", null, "select public.get_my_likers()")).error).toBe("42501");
    expect((await tryQ(db, "anon", null, "call public.proc_definer()")).error).toBe("42501");
  });

  it("ne casse rien côté connecté : authenticated et service_role gardent leurs droits, sans élargissement", async () => {
    const db = await freshDb();
    await db.exec(fixSql("2"));
    for (const f of ["public_user_count()", "admin_dashboard_stats()", "get_my_likers()", "legacy_no_search_path()", "only_via_public()"]) {
      expect(await canExec(db, "authenticated", `public.${f}`), `authenticated ${f}`).toBe(true);
    }
    expect((await tryQ(db, "authenticated", U.a, "select public.get_my_likers()")).rows[0].get_my_likers).toBe(2);
    expect(await canExec(db, "service_role", "public.get_my_likers()")).toBe(true);
    // droit tenu seulement de PUBLIC : rendu explicitement aux rôles gardés (authenticated), jamais à anon
    expect(await canExec(db, "authenticated", "public.only_via_public()")).toBe(true);
    expect(await canExec(db, "anon", "public.only_via_public()")).toBe(false);
    // la fonction INVOKER n'est pas touchée
    expect(await canExec(db, "anon", "public.invoker_fn()")).toBe(true);
    // pas d'élargissement : send_event_reminders reste fermée à authenticated, check_beta_whitelist à tous sauf le hook
    expect(await canExec(db, "authenticated", "public.send_event_reminders()")).toBe(false);
    expect(await canExec(db, "authenticated", "public.check_beta_whitelist(jsonb)")).toBe(false);
    expect(await canExec(db, "anon", "public.check_beta_whitelist(jsonb)")).toBe(false);
    expect(await canExec(db, "supabase_auth_admin", "public.check_beta_whitelist(jsonb)")).toBe(true);
  });

  it("ajoute set search_path aux fonctions qui n'en avaient pas, sans changer leur résultat", async () => {
    const db = await freshDb();
    const missing = async () =>
      (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1`)).rows.map((r) => r.proname);
    expect(await missing()).toEqual(expect.arrayContaining(["legacy_no_search_path", "proc_definer"]));
    const before = (await db.query("select public.legacy_no_search_path() as n")).rows[0].n;
    await db.exec(fixSql("2"));
    expect(await missing()).toEqual([]);
    const cfg = (await db.query("select proconfig from pg_proc where proname = 'legacy_no_search_path'")).rows[0].proconfig;
    expect(cfg).toEqual(["search_path=public, pg_temp"]);
    expect((await tryQ(db, "authenticated", U.a, "select public.legacy_no_search_path() as n")).rows[0].n).toBe(before);
  });

  it("utilise « public, extensions, pg_temp » quand le corps appelle une fonction d'extension non qualifiée", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec(`
      create schema extensions;
      create function extensions.unaccent(t text) returns text language sql immutable as $$ select lower(t) $$;
      set search_path = public, extensions;
      create function public.needs_ext(t text) returns text language sql security definer as $$ select unaccent(t) $$;
    `);
    await db.exec(fixSql("2"));
    const cfg = (await db.query("select proconfig from pg_proc where proname = 'needs_ext'")).rows[0].proconfig;
    expect(cfg).toEqual(["search_path=public, extensions, pg_temp"]);
    await db.exec("set search_path = public"); // session sans « extensions » : la fonction doit tout de même marcher
    expect((await db.query("select public.needs_ext('ÉTÉ') as t")).rows[0].t).toBe("été");
  });

  it("règle les privilèges par défaut : une future fonction n'est pas exécutable par anon, l'est par authenticated", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec(fixSql("2"));
    await db.exec("create function public.future_rpc() returns int language sql security definer set search_path = public as $$ select 1 $$;");
    const { rows } = await db.query(`select
      has_function_privilege('anon', 'public.future_rpc()', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.future_rpc()', 'EXECUTE') as auth,
      has_function_privilege('service_role', 'public.future_rpc()', 'EXECUTE') as svc`);
    expect(rows[0]).toEqual({ anon: false, auth: true, svc: true });
  });

  it("est idempotent", async () => {
    const db = await freshDb();
    await db.exec(fixSql("2"));
    const snap = async () =>
      (await db.query(`select p.oid::regprocedure::text as f, p.proacl::text as acl, p.proconfig::text as cfg from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`)).rows;
    const first = await snap();
    await db.exec(fixSql("2"));
    expect(await snap()).toEqual(first);
  });

  it("le retour arrière rend anon exécutable", async () => {
    const db = await freshDb();
    await db.exec(fixSql("2"));
    await db.exec("grant execute on function public.admin_dashboard_stats() to anon");
    expect((await tryQ(db, "anon", null, "select public.admin_dashboard_stats()")).error).toBeUndefined();
    await db.exec(rollbackSql("2"));
    await db.exec("create function public.after_rb() returns int language sql security definer set search_path = public as $$ select 1 $$;");
    expect(await canExec(db, "anon", "public.after_rb()")).toBe(true);
  });

  it("les requêtes de pré-contrôle et de contrôle du bloc s'exécutent sans erreur et le contrôle final est vide hors liste blanche", async () => {
    const db = await freshDb();
    const pre = sectionSql("2", "PRÉ-CONTRÔLE");
    expect(pre.length).toBeGreaterThanOrEqual(4);
    for (const s of pre) await db.exec(s);
    await db.exec(fixSql("2"));
    const after = sectionSql("2", "CONTRÔLE APRÈS");
    expect(after.length).toBe(2);
    const first = (await db.query(after[0])).rows.map((r) => String(r.fonction_encore_appelable_par_anon));
    expect(first).toEqual(["public_user_count()"]);
    expect((await db.query(after[1])).rows).toEqual([]);
  });
});

describe("Bloc 3A / 3B — colonnes sensibles de profiles (schéma factice)", () => {
  const SENSIBLES = ["birth_date", "ban_reason", "suspend_reason", "report_count", "flagged_for_review", "notification_preferences"];

  it("état de départ : un connecté lit birth_date et ban_reason d'un autre profil (C1 reproduit)", async () => {
    const db = await freshDb({ photos: false, functions: false });
    const r = await tryQ(db, "authenticated", U.a, "select birth_date, ban_reason, report_count from public.profiles where id = $1", [P.d]);
    expect(r.rows[0].ban_reason).toBe("spam");
  });

  it("3A : get_my_profile() renvoie uniquement MA ligne complète, jamais celle d'un autre ; refusée à anon", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec(fixSql("3A"));
    const mine = await tryQ(db, "authenticated", U.a, "select * from public.get_my_profile()");
    expect(mine.rows.length).toBe(1);
    expect(mine.rows[0].name).toBe("Alice");
    expect(mine.rows[0].ban_reason).toBe("secret-a");
    expect(mine.rows[0].birth_date).toBeTruthy();
    expect((await tryQ(db, "authenticated", "00000000-0000-0000-0000-00000000dead", "select * from public.get_my_profile()")).rows).toEqual([]);
    expect((await tryQ(db, "anon", null, "select * from public.get_my_profile()")).error).toBe("42501");
    // strictement additif : rien d'autre n'a changé
    expect((await tryQ(db, "authenticated", U.a, "select birth_date from public.profiles where id = $1", [P.b])).error).toBeUndefined();
  });

  it("3B refuse de s'exécuter sans armement ni sans 3A", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await expect(db.exec(fixSql("3B"))).rejects.toThrow(/non armé/);
    await expect(db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"))).rejects.toThrow(/3A/);
    // rien n'a bougé
    expect((await tryQ(db, "authenticated", U.a, "select birth_date from public.profiles where id = $1", [P.b])).error).toBeUndefined();
  });

  it("3B : un connecté ne lit plus les six colonnes sensibles d'un autre, mais toutes les colonnes d'OTHER_PROFILE_COLUMNS", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec(fixSql("3A"));
    await db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"));
    for (const c of SENSIBLES) {
      const r = await tryQ(db, "authenticated", U.a, `select ${c} from public.profiles where id = $1`, [P.b]);
      expect(r.error, c).toBe("42501");
    }
    expect((await tryQ(db, "authenticated", U.a, "select * from public.profiles")).error).toBe("42501");
    const ok = await tryQ(db, "authenticated", U.a, "select id, name, age, avatar_url, banned_at, suspended_until, deletion_requested_at, onboarding_completed_at, created_at, user_id from public.profiles where id = $1", [P.b]);
    expect(ok.error).toBeUndefined();
    expect(ok.rows[0].name).toBe("Bob");
    // anonyme : plus aucun droit de table
    expect((await tryQ(db, "anon", null, "select id from public.profiles")).error).toBe("42501");
    // les colonnes sensibles restent lisibles par le service_role et via get_my_profile (MA ligne)
    expect((await tryQ(db, "service_role", null, "select birth_date from public.profiles where id = $1", [P.b])).error).toBeUndefined();
    expect((await tryQ(db, "authenticated", U.a, "select birth_date, ban_reason from public.get_my_profile()")).rows[0].ban_reason).toBe("secret-a");
  });

  it("3B : les écritures sur sa propre ligne, le filtre user_id et les triggers invoker continuent de marcher ; `RETURNING *` / `.select()` non", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec(fixSql("3A"));
    await db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"));
    // update sans retour, y compris d'une colonne sensible (droit UPDATE inchangé)
    const u1 = await tryQ(db, "authenticated", U.a, "update public.profiles set name = 'Alice2', birth_date = '1990-01-01', notification_preferences = '{\"x\":1}' where user_id = $1", [U.a]);
    expect(u1.error).toBeUndefined();
    expect(u1.count).toBe(1);
    // le trigger de protection (lit OLD/NEW.report_count) s'exécute toujours
    const u2 = await tryQ(db, "authenticated", U.a, "update public.profiles set report_count = 9 where user_id = $1", [U.a]);
    expect(u2.message).toMatch(/colonne protegee/);
    // RETURNING des colonnes autorisées : ok ; RETURNING * : refusé (c'est ce que fait .update().select() de supabase-js)
    expect((await tryQ(db, "authenticated", U.a, "update public.profiles set name = 'A3' where user_id = $1 returning id, name", [U.a])).error).toBeUndefined();
    expect((await tryQ(db, "authenticated", U.a, "update public.profiles set name = 'A4' where user_id = $1 returning *", [U.a])).error).toBe("42501");
    // et la valeur écrite est bien relue via get_my_profile
    const mine = await tryQ(db, "authenticated", U.a, "select name, birth_date::text as bd from public.get_my_profile()");
    expect(mine.rows[0].name).toBe("A3");
    expect(mine.rows[0].bd).toBe("1990-01-01");
  });

  it("3B : une politique d'une autre table qui lit des colonnes NON sensibles de profiles (banned_at...) continue de marcher", async () => {
    const db = await freshDb({ photos: true, functions: false });
    await db.exec(fixSql("1")); // can_view_profile_photos est SECURITY DEFINER ; ajoutons aussi une politique invoker
    await db.exec(`
      create table public.posts (id uuid primary key default gen_random_uuid(), author_id uuid references public.profiles(id), body text);
      alter table public.posts enable row level security;
      create policy "lecture si auteur actif" on public.posts for select to authenticated
        using (exists (select 1 from public.profiles p where p.id = posts.author_id and p.banned_at is null));
      insert into public.posts (author_id, body) values ('${P.a}', 'ok'), ('${P.d}', 'banni');
    `);
    await db.exec(fixSql("3A"));
    await db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"));
    const r = await tryQ(db, "authenticated", U.b, "select body from public.posts order by body");
    expect(r.error).toBeUndefined();
    expect(r.rows.map((x) => x.body)).toEqual(["ok"]);
    expect((await photoUrls(db, "authenticated", U.a)).length).toBe(4);
  });

  it("3B : le pré-contrôle 3.c détecte une politique qui lit une colonne sensible", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec("create table public.t (id int, owner uuid); alter table public.t enable row level security; create policy p on public.t for select to authenticated using (exists (select 1 from public.profiles where id = t.owner and report_count > 3));");
    const queries = sectionSql("3B", "PRÉ-CONTRÔLE");
    const q = queries.find((s) => s.includes("'policy' as type"));
    expect(q).toBeTruthy();
    const rows = (await db.query(q)).rows;
    expect(rows.some((r) => r.type === "policy")).toBe(true);
  });

  it("3B : les requêtes de pré-contrôle et de contrôle s'exécutent sans erreur ; le contrôle final montre false x6 puis true", async () => {
    const db = await freshDb({ photos: false, functions: false });
    for (const s of sectionSql("3A", "PRÉ-CONTRÔLE")) await db.exec(s);
    for (const s of sectionSql("3B", "PRÉ-CONTRÔLE")) await db.exec(s);
    await db.exec(fixSql("3A"));
    await db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"));
    const after = sectionSql("3B", "CONTRÔLE APRÈS");
    expect(after.length).toBeGreaterThanOrEqual(2);
    const cols = (await db.query(after[0])).rows;
    expect(cols.filter((r) => r.lisible === false).map((r) => r.colonne).sort()).toEqual([...SENSIBLES].sort());
    expect(cols.filter((r) => r.lisible === true).length).toBe(5);
    expect((await db.query(after[1])).rows[0].has_table_privilege).toBe(false);
  });

  it("3B : est idempotent et le retour arrière restaure la lecture directe", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec(fixSql("3A"));
    await db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"));
    await db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"));
    expect((await tryQ(db, "authenticated", U.a, "select birth_date from public.profiles")).error).toBe("42501");
    await db.exec(rollbackSql("3B"));
    expect((await tryQ(db, "authenticated", U.a, "select * from public.profiles")).error).toBeUndefined();
  });

  it("3A : retour arrière", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await db.exec(fixSql("3A"));
    await db.exec(rollbackSql("3A"));
    expect((await db.query("select count(*)::int as n from pg_proc where proname = 'get_my_profile'")).rows[0].n).toBe(0);
  });
});

describe("Bloc 4 — Realtime : replica identity (schéma factice)", () => {
  const ident = async (db) =>
    Object.fromEntries((await db.query("select relname, relreplident from pg_class where relname in ('likes','passes','blocks','favorites','follows') and relkind = 'r'")).rows.map((r) => [r.relname, r.relreplident]));

  it("4A : blocks et passes repassent à « default », likes / follows / favorites restent « full »", async () => {
    const db = await freshDb({ photos: false, functions: false });
    expect(await ident(db)).toEqual({ likes: "f", passes: "f", blocks: "f", favorites: "f", follows: "f" });
    for (const s of sectionSql("4A", "PRÉ-CONTRÔLE")) { try { await db.exec(s); } catch (e) { if (!/supabase_realtime|pg_publication/.test(String(e.message))) throw e; } }
    await db.exec(fixSql("4A"));
    expect(await ident(db)).toEqual({ likes: "f", passes: "d", blocks: "d", favorites: "f", follows: "f" });
    await db.exec(fixSql("4A")); // idempotent
    await db.exec(rollbackSql("4A"));
    expect(await ident(db)).toEqual({ likes: "f", passes: "f", blocks: "f", favorites: "f", follows: "f" });
  });

  it("4B (armé) : likes / follows / favorites repassent à « default »", async () => {
    const db = await freshDb({ photos: false, functions: false });
    await expect(db.exec(fixSql("4B"))).rejects.toThrow(/non armé/);
    await db.exec("set baobab.arm = 'bloc4b';\n" + fixSql("4B"));
    expect(await ident(db)).toEqual({ likes: "d", passes: "f", blocks: "f", favorites: "d", follows: "d" });
    await db.exec(rollbackSql("4B"));
    expect(await ident(db)).toEqual({ likes: "f", passes: "f", blocks: "f", favorites: "f", follows: "f" });
  });

  it("4A : tolère l'absence de tables (projet de répétition partiel)", async () => {
    const db = new PGlite();
    dbs.push(db);
    await db.exec(fixSql("4A"));
  });
});

describe("Garde-fou : coller le fichier ENTIER par erreur n'applique rien", () => {
  it("le premier bloc armé lève une erreur et la transaction implicite annule tout (blocs 1 et 2 compris)", async () => {
    const db = await freshDb();
    await expect(db.exec(SQL)).rejects.toThrow(/non armé/);
    // rien n'a été appliqué : la fuite photos et les EXECUTE anon sont intacts
    expect((await photoUrls(db, "anon")).length).toBe(7);
    expect((await tryQ(db, "anon", null, "select public.admin_dashboard_stats()")).error).toBeUndefined();
    expect((await db.query("select count(*)::int as n from pg_proc where proname in ('can_view_profile_photos','get_my_profile')")).rows[0].n).toBe(0);
  });
});

describe("LANCEMENT.md — les six lignes de bilan de supabase-close-read-leaks.sql (schéma factice)", () => {
  const doc = fs.readFileSync(path.join(process.cwd(), "LANCEMENT.md"), "utf8");
  const bilanSql = (doc.match(/```sql\nwith\n([\s\S]*?)\n```/) || [])[0]?.replace(/^```sql\n/, "").replace(/\n```$/, "");

  async function bilanRows(db) {
    const rows = (await db.query(bilanSql)).rows;
    return Object.fromEntries(rows.filter((r) => r.fichier === "supabase-close-read-leaks.sql").map((r) => [r.controle.split(" : ")[0] + " " + r.controle.split(" : ")[1].slice(0, 12), r.present]));
  }

  it("la requête de bilan s'exécute (syntaxe) et les lignes passent de NON à oui après les blocs", async () => {
    expect(bilanSql).toBeTruthy();
    const db = await freshDb();
    await db.exec("create schema cron; create table cron.job (jobname text, command text); create schema vault; create table vault.secrets (name text);");
    const before = Object.values(await bilanRows(db));
    expect(before.length).toBe(6);
    expect(before.filter((v) => v === "oui").length).toBeLessThan(6);
    await db.exec(fixSql("1"));
    await db.exec(fixSql("2"));
    await db.exec(fixSql("4A"));
    await db.exec(fixSql("3A"));
    await db.exec("set baobab.arm = 'bloc3b';\n" + fixSql("3B"));
    const after = await bilanRows(db);
    expect(Object.values(after)).toEqual(Array(6).fill("oui"));
  });
});
