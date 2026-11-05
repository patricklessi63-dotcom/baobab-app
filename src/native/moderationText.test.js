// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { normalizeForModeration, checkText } from "../lib/contentModeration.js";

// Validation de supabase-moderation-text.sql (SQL-31) sur un SCHÉMA FACTICE : PGlite = PostgreSQL en
// WebAssembly. Honnêteté : ce n'est pas la base Supabase (pas de RLS réelle ici : un seul rôle) ; ce test
// prouve la syntaxe, l'équivalence SQL/JS de la normalisation, les déclencheurs, l'échelle de sanctions,
// les annulations et les signalements d'images. La RLS et les droits d'exécution se vérifient sur la répétition.

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-moderation-text.sql"), "utf8");

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let db;
const as = (n) => db.exec(`select set_config('test.uid', '${n ? U(100 + n) : ""}', false)`);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };

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
  // Les anciens tests ci-dessous décrivent une échelle courte (1 avertissement puis suspension) : on la règle ainsi.
  // Les valeurs PAR DÉFAUT du cahier des charges (4 avertissements, suspension à la 5e, bannissement à la 3e suspension)
  // sont vérifiées plus bas, dans « échelle conforme au cahier des charges », qui les rétablit explicitement.
  await db.exec("update moderation_settings set warnings_before_suspension = 1 where id = 1");
}, 120000);
afterAll(async () => { await db.close(); });

describe("le fichier SQL s'exécute en entier et se rejoue (idempotent)", () => {
  it("réexécution sans erreur, liste de départ sans doublon", async () => {
    const before = (await q("select count(*)::int as n from moderation_terms"))[0].n;
    expect(before).toBeGreaterThan(90);
    await db.exec(SQL);
    expect((await q("select count(*)::int as n from moderation_terms"))[0].n).toBe(before);
  });
  it("les 11 déclencheurs de contrôle de texte sont posés (8 zones + nom, nom de famille, métier ; + 2 de normalisation de la liste)", async () => {
    const t = await q("select count(*)::int as n from pg_trigger where tgname like 'trg_moderation_%' and tgname not like '%_norm' and not tgisinternal");
    expect(t[0].n).toBe(11);
  });
});

describe("moderation_normalize() (SQL) = normalizeForModeration() (JS)", () => {
  const corpus = [
    "connard", "Conn@rd !", "c0nnard", "c.o.n.n.a.r.d", "c o n n a r d", "f.d.p", "m3rde", "m€rde", "sale pu+e",
    "connnnnard", "Éléphant, ÇA va ?!", "j'y ai pensé", "ｃｏｎｎａｒｄ", "cönnard", "  ", "", "a b c d", "7ais-toi",
    "соnnard", "Bonjour, bienvenue au Canada !", "Un concert à Montréal", "i will kill you", "f u c k   y o u",
    "ferme ta gueule", "100 % sûr", "ÀÉÎÔÛ çñ", "tu es nul 123 456",
  ];
  it.each(corpus)("« %s »", async (text) => {
    const [{ n }] = await q("select moderation_normalize($1) as n", [text]);
    expect(n).toBe(normalizeForModeration(text));
  });
});

describe("moderation_check() (SQL) = checkText() (JS)", () => {
  const phrases = [
    "connard", "bande de connards", "conn@rd", "c.o.n.n.a.r.d", "f.d.p", "m3rde", "quel con", "il n'est pas con du tout",
    "Un concert à Montréal", "Un contact au Canada", "je vais te tuer", "i will kill you", "fuck you", "sale pd", "Bonjour !",
    "Je suis en retard", "idiot", "ferme la porte", "kill yourself", "retourne dans ton pays", "соnnard",
  ];
  it.each(phrases)("« %s »", async (text) => {
    const [r] = await q("select * from moderation_check($1)", [text]);
    const js = checkText(text);
    expect({ blocked: r.blocked, flagged: r.flagged, category: r.category, severity: r.severity })
      .toEqual({ blocked: js.blocked, flagged: js.flagged, category: js.category, severity: js.severity });
  });
});

describe("nom affiché, nom de famille et métier (textes de profil visibles par les autres)", () => {
  it("un nom, un nom de famille ou un métier injurieux est refusé à la modification ET à la création du profil", async () => {
    await as(1);
    for (const col of ["name", "last_name", "occupation"]) {
      expect(await fails(() => db.query(`update profiles set ${col} = 'sale connard' where id = $1`, [U(1)])), col).toContain("MODERATION_REFUSED");
    }
    await as(0);
    await db.exec("alter table profiles alter column id set default gen_random_uuid()");
    await as(9);
    expect(await fails(() => db.query("insert into profiles (user_id, name) values ($1, 'espèce de connard')", [U(209)]))).toContain("MODERATION_REFUSED");
  });
  it("des noms et métiers normaux passent (pas de faux positif sur des noms courants)", async () => {
    await as(1);
    for (const [col, val] of [["name", "Aïcha"], ["last_name", "Cumberland"], ["name", "Dickinson"], ["occupation", "Assistant dentaire"], ["last_name", "Bitche"], ["name", "Karim"]]) {
      expect(await fails(() => db.query(`update profiles set ${col} = $2 where id = $1`, [U(1), val])), `${col}=${val}`).toBeNull();
    }
    await db.query("update profiles set name = 'P1' where id = $1", [U(1)]);
  });
  it("une valeur inchangée n'est pas recontrôlée (un ancien nom ne bloque pas l'enregistrement du reste)", async () => {
    await as(0);
    await db.exec("update profiles set name = 'Nom limite connard' where id = '" + U(6) + "'"); // posé hors application (clé de service)
    await as(6);
    expect(await fails(() => db.query("update profiles set name = name, bio = 'Bonjour' where id = $1", [U(6)]))).toBeNull();
    await as(0);
    await db.exec("update profiles set name = 'P6', bio = null where id = '" + U(6) + "'");
  });
});

describe("déclencheurs « filet » côté serveur", () => {
  it("un message insultant est refusé avec le marqueur lu par l'application", async () => {
    await as(1);
    const err = await fails(() => db.query("insert into messages (from_id, text) values ($1, $2)", [U(1), "espèce de connard"]));
    expect(err).toContain("MODERATION_REFUSED");
    expect(err).toContain("propos non autoris");
    expect(err).toContain("Conditions d'utilisation"); // renvoi aux règles, comme le refus côté application
  });
  it("contournements refusés aussi (leet, points)", async () => {
    await as(1);
    for (const t of ["conn@rd", "c.o.n.n.a.r.d", "f.d.p"]) {
      expect(await fails(() => db.query("insert into posts (author_id, body) values ($1, $2)", [U(1), t])), t).toContain("MODERATION_REFUSED");
    }
  });
  it("un texte propre passe ; faux positifs courants passent", async () => {
    await as(1);
    for (const t of ["Bonjour !", "Un concert à Montréal", "Je cherche un contact au Canada"]) {
      expect(await fails(() => db.query("insert into messages (from_id, text) values ($1, $2)", [U(1), t])), t).toBeNull();
    }
  });
  it("les messages non texte (photo, sticker) ne sont pas contrôlés", async () => {
    await as(1);
    expect(await fails(() => db.query("insert into messages (from_id, kind, text) values ($1, 'photo', 'connard')", [U(1)]))).toBeNull();
  });
  it("chacune des 8 zones de texte refuse une insulte", async () => {
    await as(1);
    const stmts = [
      "insert into posts (body) values ('sale salope')",
      "insert into post_comments (body) values ('sale salope')",
      "insert into community_posts (body) values ('sale salope')",
      "insert into community_comments (body) values ('sale salope')",
      "insert into event_comments (body) values ('sale salope')",
      "insert into stories (text) values ('sale salope')",
      `update profiles set bio = 'sale salope' where id = '${U(1)}'`,
    ];
    for (const s of stmts) expect(await fails(() => db.exec(s)), s).toContain("MODERATION_REFUSED");
  });
  it("une biographie inchangée n'est pas recontrôlée (le reste du profil reste modifiable)", async () => {
    await as(0);
    await db.exec(`update profiles set bio = 'sale salope' where id = '${U(5)}'`); // posée hors contrôle (clé de service)
    await as(5);
    expect(await fails(() => db.exec(`update profiles set name = 'Cinq' where id = '${U(5)}'`))).toBeNull();
  });
  it("mot ambigu dans un commentaire : accepté et placé en file de relecture, une seule fois par texte", async () => {
    await as(1);
    await db.query("insert into post_comments (body) values ('quel con')");
    await db.query("insert into post_comments (body) values ('quel con')");
    const rows = await q("select status, source, term from moderation_violations where profile_id = $1 and status = 'flagged'", [U(1)]);
    expect(rows).toEqual([{ status: "flagged", source: "comment", term: "con" }]);
  });
  it("VIE PRIVÉE : un message privé ambigu n'entre jamais dans la file de relecture", async () => {
    await as(1);
    await db.query("insert into messages (from_id, text) values ($1, 'quel con vraiment')", [U(1)]);
    expect((await q("select count(*)::int as n from moderation_violations where source = 'message' and status = 'flagged'"))[0].n).toBe(0);
    expect((await q("select moderation_screen('message', 'quel con vraiment') as r"))[0].r).toMatchObject({ allowed: true, flagged: true });
    expect((await q("select count(*)::int as n from moderation_violations where source = 'message' and status = 'flagged'"))[0].n).toBe(0);
  });
  it("insertion système (sans utilisateur connecté) : jamais bloquée", async () => {
    await as(0);
    expect(await fails(() => db.query("insert into messages (from_id, text) values ($1, 'connard')", [U(1)]))).toBeNull();
  });
  it("interrupteur général : désactivé, plus aucun refus", async () => {
    await db.exec("update moderation_settings set text_filter_enabled = false where id = 1");
    await as(1);
    expect(await fails(() => db.query("insert into messages (from_id, text) values ($1, 'connard')", [U(1)]))).toBeNull();
    await db.exec("update moderation_settings set text_filter_enabled = true where id = 1");
  });
  it("échec OUVERT : une panne du filtre ne bloque pas la messagerie", async () => {
    await as(1);
    await db.exec("alter table moderation_terms rename to moderation_terms_off");
    try {
      expect(await fails(() => db.query("insert into messages (from_id, text) values ($1, 'connard')", [U(1)]))).toBeNull();
    } finally {
      await db.exec("alter table moderation_terms_off rename to moderation_terms");
    }
    expect(await fails(() => db.query("insert into messages (from_id, text) values ($1, 'connard')", [U(1)]))).toContain("MODERATION_REFUSED");
  });
});

describe("sanctions progressives", () => {
  const insults = ["sale salope", "espèce de connard", "tu es un salaud", "gros enfoiré", "ferme ta gueule"];
  // Réglage court de ce fichier (1 avertissement, puis une suspension à chaque 2e infraction, bannissement à la 3e suspension).
  it("avertissement, puis suspension de 24 h, puis (bannissement automatique désactivé) suspension de 30 jours à confirmer", async () => {
    await as(1);
    await db.exec(`update profiles set suspended_until = null, banned_at = null where id = '${U(1)}'`);
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(1)}'; delete from moderation_violations where profile_id = '${U(1)}'`);
    await db.exec("update moderation_settings set suspensions_before_ban = 2, auto_ban_enabled = false where id = 1");
    const out = [];
    for (const t of insults.slice(0, 4)) out.push((await q("select moderation_screen('message', $1) as r", [t]))[0].r);
    expect(out.map((r) => r.allowed)).toEqual([false, false, false, false]);
    expect(out.map((r) => r.sanction)).toEqual(["warning", "suspension", "warning", "suspension"]);
    expect(Math.round((new Date(out[1].until) - Date.now()) / 3600000)).toBe(24);
    // 2e suspension = palier « bannissement » mais auto_ban_enabled = faux : 30 jours à confirmer, aucun bannissement
    expect(Math.round((new Date(out[3].until) - Date.now()) / 3600000)).toBe(720);
    expect((await q("select banned_at from profiles where id = $1", [U(1)]))[0].banned_at).toBeNull();
  });
  it("bannissement réel quand auto_ban_enabled est actif", async () => {
    await as(1);
    await db.exec(`update profiles set suspended_until = null where id = '${U(1)}'`);
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(1)}'; delete from moderation_violations where profile_id = '${U(1)}'`);
    await db.exec("update moderation_settings set suspensions_before_ban = 2, auto_ban_enabled = true where id = 1");
    const out = [];
    for (const t of insults.slice(0, 4)) out.push((await q("select moderation_screen('message', $1) as r", [t]))[0].r);
    expect(out.map((r) => r.sanction)).toEqual(["warning", "suspension", "warning", "ban"]);
    expect((await q("select banned_at from profiles where id = $1", [U(1)]))[0].banned_at).not.toBeNull();
    // remise à l'état de départ pour les tests suivants
    await db.exec(`update profiles set banned_at = null, ban_reason = null, suspended_until = null where id = '${U(1)}'`);
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(1)}'; delete from moderation_violations where profile_id = '${U(1)}'`);
    await db.exec("update moderation_settings set suspensions_before_ban = 3, auto_ban_enabled = true where id = 1");
    await db.exec(`insert into auth.sessions (user_id) values ('${U(101)}'), ('${U(101)}')`); // sessions refaites pour l'utilisateur 1
  });
  it("le même texte renvoyé tout de suite n'est PAS une nouvelle infraction", async () => {
    await as(5);
    const a = (await q("select moderation_screen('post', 'sale salope') as r"))[0].r;
    const b = (await q("select moderation_screen('post', 'sale salope') as r"))[0].r;
    expect(a.sanction).toBe("warning");
    expect(b).toMatchObject({ allowed: false, duplicate: true });
    expect((await q("select count(*)::int as n from moderation_sanctions where profile_id = $1", [U(5)]))[0].n).toBe(1);
  });
  it("une infraction produit au plus une sanction (index unique)", async () => {
    const err = await fails(() => db.exec(`
      insert into moderation_sanctions (profile_id, violation_id, kind) select profile_id, id, 'warning' from moderation_violations where profile_id = '${U(5)}' and status = 'counted' limit 1`));
    expect(err).toBeTruthy();
  });
  it("l'équipe de la plateforme n'est jamais sanctionnée automatiquement", async () => {
    await as(2);
    const r = (await q("select moderation_screen('message', 'sale salope') as r"))[0].r;
    expect(r.allowed).toBe(false);
    expect(r.sanction).toBeNull();
    expect((await q("select suspended_until, banned_at from profiles where id = $1", [U(2)]))[0]).toEqual({ suspended_until: null, banned_at: null });
  });
  it("un texte propre ou ambigu n'est jamais sanctionné", async () => {
    await as(6);
    expect((await q("select moderation_screen('comment', 'Bonjour !') as r"))[0].r).toEqual({ allowed: true });
    expect((await q("select moderation_screen('comment', 'quel con') as r"))[0].r).toMatchObject({ allowed: true, flagged: true });
    expect((await q("select count(*)::int as n from moderation_sanctions where profile_id = $1", [U(6)]))[0].n).toBe(0);
  });
  it("source invalide et utilisateur anonyme refusés", async () => {
    await as(6);
    expect(await fails(() => db.query("select moderation_screen('inconnue', 'x')"))).toContain("Source invalide");
    await as(0);
    expect(await fails(() => db.query("select moderation_screen('post', 'x')"))).toContain("Non autorise");
  });
});

describe("annulation, appel et décisions humaines", () => {
  it("un modérateur annule une suspension : le compte est rétabli, l'infraction est annulée, la décision est journalisée", async () => {
    await as(0);
    await db.exec(`update profiles set suspended_until = null, suspend_reason = null, banned_at = null where id = '${U(5)}'`);
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(5)}'; delete from moderation_violations where profile_id = '${U(5)}'`);
    await as(5);
    await q("select moderation_screen('message', 'sale salope') as r");
    await q("select moderation_screen('message', 'espèce de connard') as r");
    const [s] = await q("select id from moderation_sanctions where profile_id = $1 and kind = 'suspension'", [U(5)]);
    expect((await q("select suspended_until from profiles where id = $1", [U(5)]))[0].suspended_until).not.toBeNull();

    await as(1); // simple utilisateur
    expect(await fails(() => db.query("select moderation_revoke_sanction($1, 'test')", [s.id]))).toContain("Non autorise");

    await as(2); // modérateur
    await db.query("select moderation_revoke_sanction($1, 'erreur de la liste')", [s.id]);
    expect((await q("select suspended_until from profiles where id = $1", [U(5)]))[0].suspended_until).toBeNull();
    expect((await q("select revoked_at is not null as r from moderation_sanctions where id = $1", [s.id]))[0].r).toBe(true);
    expect((await q("select count(*)::int as n from moderation_decisions where action = 'sanction_revoked'"))[0].n).toBe(1);
  });
  it("la personne sanctionnée peut contester UNE fois ; le modérateur accepte ou refuse", async () => {
    await as(0);
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(6)}'; delete from moderation_violations where profile_id = '${U(6)}'`);
    await as(6);
    await q("select moderation_screen('message', 'sale salope') as r");
    await q("select moderation_screen('message', 'espèce de connard') as r");
    const [s] = await q("select id from moderation_sanctions where profile_id = $1 and kind = 'suspension'", [U(6)]);

    await as(1); // pas la sienne
    expect(await fails(() => db.query("select moderation_appeal($1, 'ce texte était une citation')", [s.id]))).toContain("Non autorise");
    await as(6);
    expect(await fails(() => db.query("select moderation_appeal($1, 'court')", [s.id]))).toContain("APPEAL_TOO_SHORT");
    await db.query("select moderation_appeal($1, 'ce texte était une citation')", [s.id]);
    expect(await fails(() => db.query("select moderation_appeal($1, 'ce texte était une citation')", [s.id]))).toContain("APPEAL_UNAVAILABLE");

    await as(2);
    const pending = await q("select count(*)::int as n from admin_moderation_sanctions(true)");
    expect(pending[0].n).toBe(1);
    await db.query("select moderation_decide_appeal($1, true, 'citation')", [s.id]);
    const [after] = await q("select appeal_status, revoked_at is not null as revoked from moderation_sanctions where id = $1", [s.id]);
    expect(after).toEqual({ appeal_status: "accepted", revoked: true });
    expect((await q("select suspended_until from profiles where id = $1", [U(6)]))[0].suspended_until).toBeNull();
  });
  it("texte « à relire » : approuvé (aucune sanction) ou confirmé (compte dans l'échelle)", async () => {
    await as(0);
    await db.exec("delete from moderation_sanctions; delete from moderation_violations");
    await as(1);
    await db.query("insert into post_comments (body) values ('quel con')");
    await db.query("insert into post_comments (body) values ('quel idiot')");
    await as(2);
    const flagged = await q("select id, term from admin_moderation_violations('flagged') order by term");
    expect(flagged.map((f) => f.term)).toEqual(["con", "idiot"]);
    await as(1); // simple utilisateur : refusé
    expect(await fails(() => db.query("select moderation_resolve_flag($1, true)", [flagged[0].id]))).toContain("Non autorise");
    expect(await fails(() => db.query("select * from admin_moderation_violations()"))).toContain("Non autorise");
    await as(2);
    await db.query("select moderation_resolve_flag($1, false, 'compliment')", [flagged[0].id]);
    const confirmed = (await q("select moderation_resolve_flag($1, true, 'insulte') as r", [flagged[1].id]))[0].r;
    expect(confirmed.sanction).toBe("warning");
    expect((await q("select count(*)::int as n from moderation_violations where status = 'overturned'"))[0].n).toBe(1);
  });
});

describe("liste, exceptions et réglages (administrateurs seulement)", () => {
  it("un administrateur ajoute un terme et une exception ; le filtre les applique tout de suite", async () => {
    await as(2); // modérateur : refusé
    expect(await fails(() => db.query("select admin_upsert_moderation_term('zorglub', 'insulte', 'block')"))).toContain("Non autorise");
    await as(3);
    await db.query("select admin_upsert_moderation_term('Zorglub', 'insulte', 'block')");
    expect((await q("select blocked from moderation_check('sale zorglub')"))[0].blocked).toBe(true);
    await db.query("select admin_upsert_moderation_exception('pas zorglub')");
    expect((await q("select blocked from moderation_check('pas zorglub')"))[0].blocked).toBe(false);
    await db.query("select admin_upsert_moderation_term('zorglub', 'insulte', 'block', false)"); // désactivé
    expect((await q("select blocked from moderation_check('sale zorglub')"))[0].blocked).toBe(false);
  });
  it("les accents du terme saisi sont normalisés (« Café » devient « cafe »)", async () => {
    await as(3);
    await db.query("select admin_upsert_moderation_term('Mauvaisé', 'insulte', 'review')");
    expect((await q("select term_norm from moderation_terms where term = 'Mauvaisé'"))[0].term_norm).toBe("mauvaise");
  });
  it("réglages : administrateur seulement, valeurs conservées si absentes", async () => {
    await as(2);
    expect(await fails(() => db.query("select admin_update_moderation_settings('{\"window_days\": 10}'::jsonb)"))).toContain("Non autorise");
    await as(3);
    await db.query("select admin_update_moderation_settings('{\"window_days\": 10}'::jsonb)");
    const [s] = await q("select window_days, text_filter_enabled, media_report_threshold from moderation_settings");
    expect(s).toEqual({ window_days: 10, text_filter_enabled: true, media_report_threshold: 3 });
    await db.query("select admin_update_moderation_settings('{\"window_days\": 30}'::jsonb)");
  });
});

describe("signalements d'images", () => {
  const img = "11111111-1111-1111-1111-111111111111";
  it("un seul signalement par personne : le doublon ne gonfle pas le compteur", async () => {
    await as(1);
    await db.query("select report_media('post_media', $1, 'sexuel')", [img]);
    const dup = (await q("select report_media('post_media', $1, 'sexuel') as r", [img]))[0].r;
    expect(dup).toEqual({ duplicate: true });
    expect((await q("select report_count from media_moderation where target_id = $1", [img]))[0].report_count).toBe(1);
  });
  it("trois signalements indépendants masquent l'image ; les modérateurs la voient et peuvent la rétablir", async () => {
    await as(4);
    await db.query("select report_media('post_media', $1, 'sexuel')", [img]);
    expect((await q("select status from media_moderation where target_id = $1", [img]))[0].status).toBe("visible");
    await as(5);
    const r = (await q("select report_media('post_media', $1, 'violence') as r", [img]))[0].r;
    expect(r).toMatchObject({ reports: 3, hidden: true });
    expect((await q("select status from media_moderation where target_id = $1", [img]))[0].status).toBe("hidden");

    await as(1);
    expect(await fails(() => db.query("select * from admin_media_queue()"))).toContain("Non autorise");
    await as(2);
    const queue = await q("select status, report_count, reasons from admin_media_queue()");
    expect(queue[0]).toMatchObject({ status: "hidden", report_count: 3 });
    await db.query("select moderate_media('post_media', $1, 'restore', 'image anodine')", [img]);
    expect((await q("select status, locked from media_moderation where target_id = $1", [img]))[0]).toEqual({ status: "visible", locked: true });
  });
  it("une image rétablie par un humain n'est plus masquée automatiquement", async () => {
    await as(6);
    await db.query("select report_media('post_media', $1, 'haine')", [img]);
    expect((await q("select status from media_moderation where target_id = $1", [img]))[0].status).toBe("visible");
  });
  it("« retirer » ne supprime aucune ligne : seul le statut change", async () => {
    await as(2);
    await db.query("select moderate_media('post_media', $1, 'remove', 'contenu explicite')", [img]);
    expect((await q("select status from media_moderation where target_id = $1", [img]))[0].status).toBe("removed");
    expect((await q("select count(*)::int as n from media_reports where target_id = $1", [img]))[0].n).toBe(4);
  });
  it("signalements surtout par des comptes tout neufs : l'image reste visible et attend un humain", async () => {
    const img2 = "22222222-2222-2222-2222-222222222222";
    await db.exec(`insert into profiles (id, user_id, name) values ('${U(8)}', '${U(108)}', 'N8'), ('${U(9)}', '${U(109)}', 'N9')`);
    for (const n of [7, 8, 9]) { await as(n); await db.query("select report_media('story', $1, 'harcelement')", [img2]); }
    const [m] = await q("select status, suspicious from media_moderation where target_id = $1", [img2]);
    expect(m).toEqual({ status: "visible", suspicious: true });
    await as(2);
    expect((await q("select count(*)::int as n from admin_media_queue() where suspicious"))[0].n).toBe(1);
  });
  it("limite horaire de signalements par personne", async () => {
    await as(0);
    await db.exec("update moderation_settings set media_reports_per_hour = 2 where id = 1");
    await as(3);
    await db.query("select report_media('avatar', '33333333-3333-3333-3333-333333333331', 'autre')");
    await db.query("select report_media('avatar', '33333333-3333-3333-3333-333333333332', 'autre')");
    expect(await fails(() => db.query("select report_media('avatar', '33333333-3333-3333-3333-333333333333', 'autre')"))).toContain("REPORT_RATE_LIMIT");
    await as(0);
    await db.exec("update moderation_settings set media_reports_per_hour = 10 where id = 1");
  });
  it("types et motifs invalides refusés par la base", async () => {
    await as(4);
    expect(await fails(() => db.query("select report_media('nimportequoi', $1, 'sexuel')", ['44444444-4444-4444-4444-444444444444']))).toBeTruthy();
    expect(await fails(() => db.query("select report_media('story', $1, 'motif-inventé')", ['44444444-4444-4444-4444-444444444444']))).toBeTruthy();
  });
});

describe("admin_media_info : l'adresse de l'image pour le modérateur", () => {
  it("retrouve l'image et son auteur pour chaque type connu ; refusé à un simple utilisateur", async () => {
    await as(0);
    const [st] = await q("insert into stories (profile_id, text, media_url) values ($1, null, 'https://x/story.jpg') returning id", [U(1)]);
    const [po] = await q("insert into posts (author_id, body) values ($1, 'photo') returning id", [U(1)]);
    const [pm] = await q("insert into post_media (post_id, url) values ($1, 'https://x/post.jpg') returning id", [po.id]);
    const [cp] = await q("insert into community_posts (body, media_url, author_id) values ('c', 'https://x/comm.jpg', $1) returning id", [U(1)]);
    const [ph] = await q("insert into profile_photos (profile_id, url) values ($1, 'https://x/photo.jpg') returning id", [U(1)]);
    await db.exec(`update profiles set avatar_url = 'https://x/avatar.jpg' where id = '${U(1)}'`);

    await as(1);
    expect(await fails(() => db.query("select * from admin_media_info('story', $1)", [st.id]))).toContain("Non autorise");

    await as(2);
    const cases = [["story", st.id, "story.jpg"], ["post_media", pm.id, "post.jpg"], ["community_post", cp.id, "comm.jpg"], ["profile_photo", String(ph.id), "photo.jpg"], ["avatar", U(1), "avatar.jpg"]];
    for (const [kind, id, file] of cases) {
      const [r] = await q("select * from admin_media_info($1, $2)", [kind, id]);
      expect(r.url, kind).toContain(file);
      expect(r.owner_id, kind).toBe(U(1));
      expect(r.owner_name, kind).toBe("P1");
    }
    expect(await q("select * from admin_media_info('message_media', $1)", [st.id])).toEqual([]);
  });
});

describe("photo de profil : identifiant ENTIER (profile_photos.id est bigint en production)", () => {
  it("signaler, masquer après 3 signalements, lister et rétablir une photo de profil par son identifiant entier", async () => {
    await as(0);
    await db.exec("update moderation_settings set media_report_threshold = 3, media_reports_per_hour = 10 where id = 1");
    const [ph2] = await q("insert into profile_photos (profile_id, url) values ($1, 'https://x/p2.jpg') returning id", [U(1)]);
    const id = String(ph2.id);
    expect(id).toMatch(/^[0-9]+$/); // un entier, pas un uuid
    for (const n of [3, 4, 5]) { await as(n); await db.query("select report_media('profile_photo', $1, 'harcelement')", [id]); }
    const [m] = await q("select status, report_count from media_moderation where target_kind = 'profile_photo' and target_id = $1", [id]);
    expect(m).toEqual({ status: "hidden", report_count: 3 });
    await as(2);
    const queue = await q("select target_kind, target_id from admin_media_queue() where target_kind = 'profile_photo'");
    expect(queue).toEqual([{ target_kind: "profile_photo", target_id: id }]);
    await db.query("select moderate_media('profile_photo', $1, 'restore', 'photo légitime')", [id]);
    expect((await q("select status, locked from media_moderation where target_kind = 'profile_photo' and target_id = $1", [id]))[0]).toEqual({ status: "visible", locked: true });
  });
  it("le fichier SQL se rejoue sur une base où l'ancienne version (target_id uuid) était installée : colonnes converties, anciennes signatures retirées", async () => {
    await as(0);
    await db.exec("alter table media_reports alter column target_id type uuid using null; ").catch(() => {}); // peut échouer s'il reste des lignes : on vide d'abord
    await db.exec("delete from media_reports; delete from media_moderation;");
    await db.exec("alter table media_reports alter column target_id type uuid using target_id::uuid; alter table media_moderation alter column target_id type uuid using target_id::uuid;");
    await db.exec("create function report_media(p_kind text, p_id uuid, p_reason text, p_note text default null) returns jsonb language sql as $$ select '{}'::jsonb $$;");
    await db.exec(SQL);
    expect((await q("select data_type from information_schema.columns where table_name = 'media_reports' and column_name = 'target_id'"))[0].data_type).toBe("text");
    expect((await q("select data_type from information_schema.columns where table_name = 'media_moderation' and column_name = 'target_id'"))[0].data_type).toBe("text");
    expect((await q("select oidvectortypes(proargtypes) as t from pg_proc where proname = 'report_media'")).map((r) => r.t)).toEqual(["text, text, text, text"]);
  });
});

describe("vie privée et conservation", () => {
  it("un message privé refusé enregistre le terme et l'empreinte, JAMAIS le texte (ni extrait)", async () => {
    await as(0);
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(6)}'; delete from moderation_violations where profile_id = '${U(6)}'`);
    await as(6);
    await q("select moderation_screen('message', 'phrase privée avec un connard dedans') as r");
    await q("select moderation_screen('post', 'publication publique avec un connard dedans') as r");
    await as(0);
    const rows = await q("select source, term, excerpt is null as sans_extrait, length(text_hash) as h from moderation_violations where profile_id = $1 order by source", [U(6)]);
    expect(rows).toEqual([
      { source: "message", term: "connard", sans_extrait: true, h: 32 },
      { source: "post", term: "connard", sans_extrait: false, h: 32 },
    ]);
  });

  it("l'extrait d'une publication est limité à 200 caractères", async () => {
    await as(5);
    await q("select moderation_screen('post', $1) as r", ["sale connard " + "x".repeat(500)]);
    await as(0);
    const [{ n }] = await q("select max(length(excerpt))::int as n from moderation_violations where profile_id = $1", [U(5)]);
    expect(n).toBeLessThanOrEqual(200);
  });

  it("purge : réservée aux administrateurs, durée minimale 30 jours, supprime les anciennes infractions et GARDE les sanctions", async () => {
    await as(0);
    await db.exec(`delete from moderation_sanctions; delete from moderation_violations`);
    await db.exec(`insert into moderation_violations (profile_id, source, term, text_hash, status, created_at)
      values ('${U(1)}', 'post', 'a', 'h1', 'counted', now() - interval '400 days'), ('${U(1)}', 'post', 'b', 'h2', 'counted', now() - interval '10 days')`);
    await db.exec(`insert into moderation_sanctions (profile_id, violation_id, kind) select '${U(1)}', id, 'warning' from moderation_violations where term = 'a'`);

    await as(2);
    expect(await fails(() => db.query("select moderation_purge_old(365)"))).toContain("Non autorise");
    await as(3);
    expect(await fails(() => db.query("select moderation_purge_old(7)"))).toContain("Duree minimale");
    expect((await q("select moderation_purge_old(365) as n"))[0].n).toBe(1);
    expect((await q("select term from moderation_violations"))).toEqual([{ term: "b" }]);
    const sanctions = await q("select kind, violation_id from moderation_sanctions");
    expect(sanctions).toEqual([{ kind: "warning", violation_id: null }]);
    expect((await q("select count(*)::int as n from moderation_decisions where action = 'violations_purged'"))[0].n).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Cahier des charges de modération (4 nov. 2026) : échelle, bannissement, sessions, réinscription, journal, règles adaptatives.
// ---------------------------------------------------------------------------------------------------------------------
describe("échelle conforme au cahier des charges (4 avertissements, 5e = suspension 24 h, 3e suspension = bannissement)", () => {
  // Textes tous différents (un même texte renvoyé en moins de 10 minutes n'est pas une nouvelle infraction).
  const SUFFIXES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar"];
  const say = async (i) => (await q("select moderation_screen('message', $1) as r", [`espèce de connard ${SUFFIXES[i]}`]))[0].r;
  let results;

  // Protection des colonnes de confiance ARMÉE : les sanctions automatiques doivent passer par le drapeau serveur, comme en production
  // (défaut trouvé sur la répétition : sans lui, la 5e infraction échouait pour un compte connecté).
  beforeAll(async () => {
    await db.exec("select set_config('test.enforce_trust', 'on', false)");
    await as(0);
    await db.exec("update moderation_settings set warnings_before_suspension = 4, suspension_hours = 24, suspensions_before_ban = 3, auto_ban_enabled = true, window_days = 365 where id = 1");
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(4)}'; delete from moderation_violations where profile_id = '${U(4)}'`);
    await db.exec(`update profiles set suspended_until = null, banned_at = null where id = '${U(4)}'`);
    await as(4);
    results = [];
    for (let i = 0; i < 15; i++) results.push(await say(i));
  });

  it("les infractions 1 à 4 sont des avertissements : le contenu est bloqué, rien d'autre ne change", () => {
    expect(results.slice(0, 4).map((r) => r.allowed)).toEqual([false, false, false, false]);
    expect(results.slice(0, 4).map((r) => r.sanction)).toEqual(["warning", "warning", "warning", "warning"]);
    expect(results.slice(0, 4).map((r) => r.warnings_left)).toEqual([3, 2, 1, 0]);
  });
  it("la 5e infraction suspend le compte 24 heures", () => {
    expect(results[4].sanction).toBe("suspension");
    expect(Math.round((new Date(results[4].until) - Date.now()) / 3600000)).toBe(24);
    expect(results[4].count).toBe(5);
  });
  it("on continue de compter après la 1re suspension : 6 à 9 avertissements, 10e = 2e suspension, 11 à 14 avertissements", () => {
    expect(results.slice(5, 9).map((r) => r.sanction)).toEqual(["warning", "warning", "warning", "warning"]);
    expect(results[9].sanction).toBe("suspension");
    expect(results.slice(10, 14).map((r) => r.sanction)).toEqual(["warning", "warning", "warning", "warning"]);
  });
  it("la 3e suspension (15e infraction) bannit définitivement le compte", async () => {
    expect(results[14].sanction).toBe("ban");
    const [p] = await q("select banned_at, ban_reason from profiles where id = $1", [U(4)]);
    expect(p.banned_at).not.toBeNull();
    // 15 infractions, 14 sanctions « avertissement/suspension » + 1 bannissement : une sanction par infraction, pas plus
    expect((await q("select count(*)::int as n from moderation_sanctions where profile_id = $1", [U(4)]))[0].n).toBe(15);
    expect((await q("select count(*)::int as n from moderation_sanctions where profile_id = $1 and kind = 'suspension'", [U(4)]))[0].n).toBe(2);
  });
  it("le harnais protège réellement les colonnes : un compte connecté ne peut pas se sanctionner ni se rétablir par une écriture directe", async () => {
    await as(1);
    expect(await fails(() => db.query("update profiles set banned_at = null where id = $1", [U(4)]))).toContain("ne peut pas etre modifiee");
    expect(await fails(() => db.query("update profiles set suspended_until = null where id = $1", [U(4)]))).toContain("ne peut pas etre modifiee");
  });
  it("un compte banni ne peut plus se reconnecter (auth.users.banned_until) ; levé au débannissement", async () => {
    await as(0);
    const [{ b }] = await q("select banned_until > now() + interval '50 years' as b from auth.users where id = $1", [U(104)]);
    expect(b).toBe(true);
    expect((await q("select banned_until from auth.users where id = $1", [U(105)]))[0].banned_until).toBeNull(); // les autres comptes ne sont pas touchés
  });
  it("le bannissement révoque les sessions et les jetons d'authentification et le journalise", async () => {
    expect((await q("select count(*)::int as n from auth.sessions where user_id = $1", [U(104)]))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from auth.refresh_tokens where user_id = $1 and not revoked", [U(104)]))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from auth.sessions where user_id = $1", [U(105)]))[0].n).toBe(2); // les autres comptes ne sont pas touchés
    expect((await q("select count(*)::int as n from moderation_decisions where action = 'ban_applied' and target_profile_id = $1", [U(4)]))[0].n).toBe(1);
  });
  it("l'équipe de la plateforme n'est jamais bannie automatiquement, même au-delà du seuil", async () => {
    await as(2);
    for (let i = 0; i < 6; i++) await say(i);
    expect((await q("select banned_at from profiles where id = $1", [U(2)]))[0].banned_at).toBeNull();
  });
});

describe("protection contre le contournement : registre d'identités bannies, réinscription", () => {
  const signup = (n, email) => db.query("insert into auth.users (id, email) values ($1, $2)", [U(300 + n), email]);
  it("l'empreinte ignore les alias +, la casse et les points Gmail ; deux adresses différentes ont deux empreintes", async () => {
    const key = async (e) => (await q("select moderation_email_key($1) as k", [e]))[0].k;
    expect(await key("John.Doe+promo@Gmail.com")).toBe(await key("johndoe@googlemail.com"));
    expect(await key("a.b@example.com")).not.toBe(await key("ab@example.com")); // les points ne comptent que chez Gmail
    expect(await key("x@example.com")).not.toBe(await key("y@example.com"));
    expect(await key("pas une adresse")).toBeNull();
  });
  it("le registre ne contient aucune adresse en clair", async () => {
    const rows = await q("select email_key from banned_identities");
    expect(rows.length).toBe(1);
    expect(rows[0].email_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("user4");
  });
  it("un compte banni ne peut pas se réinscrire avec la même adresse ni avec un alias", async () => {
    expect(await fails(() => signup(1, "user4@example.com"))).toContain("ACCOUNT_BANNED");
    expect(await fails(() => signup(2, "USER4+autre@Example.com"))).toContain("ACCOUNT_BANNED");
  });
  it("une adresse sans lien avec un compte banni s'inscrit normalement", async () => {
    expect(await fails(() => signup(3, "personne.neuve@example.com"))).toBeNull();
  });
  it("changer l'adresse d'un compte vers une adresse bannie est refusé ; réécrire la ligne sans changer d'adresse ne déclenche rien", async () => {
    expect(await fails(() => db.query("update auth.users set email = 'user4@example.com' where id = $1", [U(103)]))).toContain("ACCOUNT_BANNED");
    expect(await fails(() => db.query("update auth.users set email = email where id = $1", [U(104)]))).toBeNull(); // connexion d'un compte banni : pas d'erreur obscure
    expect(await fails(() => db.query("update auth.users set email = 'autre.adresse@example.com' where id = $1", [U(103)]))).toBeNull();
    await db.query("update auth.users set email = 'User3@Example.com' where id = $1", [U(103)]);
  });
  it("deux comptes bannis qui partagent la même adresse normalisée : lever le ban de l'un NE libère PAS l'adresse de l'autre", async () => {
    await as(0);
    await db.query("update auth.users set email = 'USER6+alt@Example.com' where id = $1", [U(107)]); // même boîte que le compte 6
    await db.exec(`update profiles set banned_at = now() where id in ('${U(6)}', '${U(7)}')`);
    expect((await q("select count(*)::int as n from banned_identities where profile_id in ($1, $2)", [U(6), U(7)]))[0].n).toBe(2);
    await db.exec(`update profiles set banned_at = null where id = '${U(6)}'`);
    expect(await fails(() => signup(5, "user6@example.com"))).toContain("ACCOUNT_BANNED"); // le compte 7 reste banni
    await db.exec(`update profiles set banned_at = null where id = '${U(7)}'`);
    expect(await fails(() => signup(5, "user6@example.com"))).toBeNull();
    await db.query("update auth.users set email = 'User7@Example.com' where id = $1", [U(107)]);
  });
  it("la levée du bannissement par un modérateur rétablit le compte et retire l'empreinte", async () => {
    expect((await q("select banned_until from auth.users where id = $1", [U(104)]))[0].banned_until).not.toBeNull();
    await as(2);
    const [s] = await q("select id from moderation_sanctions where profile_id = $1 and kind = 'ban'", [U(4)]);
    await db.query("select moderation_revoke_sanction($1, 'erreur de la liste')", [s.id]);
    expect((await q("select banned_at from profiles where id = $1", [U(4)]))[0].banned_at).toBeNull();
    expect((await q("select count(*)::int as n from banned_identities"))[0].n).toBe(0);
    expect(await fails(() => signup(4, "user4@example.com"))).toBeNull();
    expect((await q("select banned_until from auth.users where id = $1", [U(104)]))[0].banned_until).toBeNull(); // reconnexion de nouveau possible
    expect((await q("select count(*)::int as n from moderation_decisions where action = 'ban_lifted' and target_profile_id = $1", [U(4)]))[0].n).toBe(1);
  });
  it("un bannissement MANUEL (ban_user : simple mise à jour de profiles.banned_at) déclenche aussi la révocation", async () => {
    await as(0);
    expect((await q("select count(*)::int as n from auth.sessions where user_id = $1", [U(105)]))[0].n).toBe(2);
    await db.exec(`update profiles set banned_at = now(), ban_reason = 'decision manuelle' where id = '${U(5)}'`);
    expect((await q("select count(*)::int as n from auth.sessions where user_id = $1", [U(105)]))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from banned_identities"))[0].n).toBe(1);
    await db.exec(`update profiles set banned_at = null, ban_reason = null where id = '${U(5)}'`);
    expect((await q("select count(*)::int as n from banned_identities"))[0].n).toBe(0);
  });
  it("une panne du nettoyage des sessions ne bloque jamais le bannissement (et est journalisée)", async () => {
    await as(0);
    await db.exec("alter table auth.sessions rename to sessions_off");
    try {
      await db.exec("create view auth.sessions as select 1 as id, null::uuid as user_id"); // un view : le DELETE échoue
      await db.exec(`update profiles set banned_at = now() where id = '${U(6)}'`);
    } finally {
      await db.exec("drop view auth.sessions; alter table auth.sessions_off rename to sessions");
    }
    expect((await q("select banned_at from profiles where id = $1", [U(6)]))[0].banned_at).not.toBeNull();
    expect((await q("select count(*)::int as n from moderation_decisions where action = 'ban_cleanup_failed' and target_profile_id = $1", [U(6)]))[0].n).toBe(1);
    await db.exec(`update profiles set banned_at = null where id = '${U(6)}'`);
  });
});

describe("journal des décisions non modifiable", () => {
  it("ni modification ni suppression d'une décision, même par une requête directe", async () => {
    await as(0);
    expect(await fails(() => db.exec("update moderation_decisions set reason = 'falsifie'"))).toContain("non modifiable");
    expect(await fails(() => db.exec("update moderation_decisions set action = 'autre'"))).toContain("non modifiable");
    expect(await fails(() => db.exec("delete from moderation_decisions"))).toContain("non modifiable");
  });
  it("la suppression d'un compte (clé étrangère -> NULL) reste possible et conserve la décision", async () => {
    await as(0);
    await db.exec(`insert into profiles (id, user_id, name) values ('${U(50)}', '${U(150)}', 'A supprimer')`);
    await db.exec(`insert into moderation_decisions (actor_id, action, target_profile_id, reason) values ('${U(3)}', 'test_decision', '${U(50)}', 'garder')`);
    await db.exec(`delete from profiles where id = '${U(50)}'`);
    expect((await q("select target_profile_id, reason from moderation_decisions where action = 'test_decision'"))[0]).toEqual({ target_profile_id: null, reason: "garder" });
  });
});

describe("modération adaptative : suggestions à valider, précision des règles, test sans effet", () => {
  it("un moderateur propose, mais RIEN n'est appliqué sans la décision d'un administrateur", async () => {
    await as(1);
    expect(await fails(() => db.query("select moderation_suggest_rule('new_term', 'bouzin', 'insulte', 'block')"))).toContain("Non autorise");
    await as(2);
    const [{ id }] = await q("select moderation_suggest_rule('new_variant', 'bouzin', 'insulte', 'block', 'vu dans 3 signalements') as id");
    expect((await q("select blocked from moderation_check('espece de bouzin')"))[0].blocked).toBe(false);
    expect(await fails(() => db.query("select admin_decide_rule_suggestion($1, true)", [id]))).toContain("Non autorise");
    expect((await q("select count(*)::int as n from admin_moderation_suggestions('pending')"))[0].n).toBe(1);

    await as(3);
    await db.query("select admin_decide_rule_suggestion($1, true, 'confirme')", [id]);
    expect((await q("select blocked from moderation_check('espece de bouzin')"))[0].blocked).toBe(true);
    expect((await q("select status from moderation_rule_suggestions where id = $1", [id]))[0].status).toBe("accepted");
    expect(await fails(() => db.query("select admin_decide_rule_suggestion($1, true)", [id]))).toContain("deja traitee");
  });
  it("un faux positif accepté devient une exception ; une suggestion rejetée ne crée rien", async () => {
    await as(2);
    const [{ id: fp }] = await q("select moderation_suggest_rule('false_positive', 'pas de bouzin', 'insulte', 'review') as id");
    const [{ id: rej }] = await q("select moderation_suggest_rule('new_term', 'machintruc', 'insulte', 'block') as id");
    await as(3);
    await db.query("select admin_decide_rule_suggestion($1, true)", [fp]);
    await db.query("select admin_decide_rule_suggestion($1, false, 'trop ambigu')", [rej]);
    expect((await q("select blocked from moderation_check('pas de bouzin')"))[0].blocked).toBe(false);
    expect((await q("select count(*)::int as n from moderation_terms where term = 'machintruc'"))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from moderation_decisions where action in ('rule_suggested', 'rule_accepted', 'rule_rejected')"))[0].n).toBe(6);
  });
  it("précision par terme : confirmées contre annulées, réservée aux modérateurs", async () => {
    await as(1);
    expect(await fails(() => db.query("select * from admin_moderation_term_stats(365)"))).toContain("Non autorise");
    await as(2);
    const stats = await q("select * from admin_moderation_term_stats(365)");
    const connard = stats.find((r) => r.term === "connard");
    expect(connard.confirmed).toBeGreaterThan(0);
    expect(Number(connard.precision_ratio)).toBeGreaterThan(0);
    expect(Number(connard.precision_ratio)).toBeLessThanOrEqual(1);
  });
  it("tester un texte ou un terme candidat n'enregistre ni infraction ni sanction", async () => {
    await as(2);
    const before = (await q("select (select count(*) from moderation_violations)::int as v, (select count(*) from moderation_sanctions)::int as s"))[0];
    const r = (await q("select admin_test_moderation('sale zebulon', 'Zébulon') as r"))[0].r;
    expect(r).toMatchObject({ blocked: false, candidate_match: true });
    expect((await q("select admin_test_moderation('espèce de connard') as r"))[0].r).toMatchObject({ blocked: true, category: "insulte" });
    expect((await q("select (select count(*) from moderation_violations)::int as v, (select count(*) from moderation_sanctions)::int as s"))[0]).toEqual(before);
    await as(1);
    expect(await fails(() => db.query("select admin_test_moderation('x')"))).toContain("Non autorise");
  });
});

describe("explication de la sanction à la personne concernée", () => {
  it("my_moderation_status() donne la règle, le nombre d'infractions confirmées et la sanction active, sans rien révéler d'autre", async () => {
    await as(0);
    await db.exec(`delete from moderation_sanctions where profile_id = '${U(7)}'; delete from moderation_violations where profile_id = '${U(7)}'`);
    await as(7);
    await q("select moderation_screen('message', 'espèce de connard') as r");
    const s = (await q("select my_moderation_status() as s"))[0].s;
    expect(s).toMatchObject({ confirmed_violations: 1, warnings_before_suspension: 4, suspension_hours: 24, suspensions_before_ban: 3 });
    expect(s.sanction).toMatchObject({ kind: "warning" });
    expect(JSON.stringify(s)).not.toMatch(/reporter|declarant|from_id/i);
    await as(0);
    expect(await fails(() => db.query("select my_moderation_status()"))).toContain("Non autorise");
  });
});
