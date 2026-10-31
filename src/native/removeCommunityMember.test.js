// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// ============================================================================
// Validation de supabase-remove-community-member-cleanup-events-fix.sql sur un SCHÉMA FACTICE.
//
// HONNÊTETÉ : PGlite (PostgreSQL en WebAssembly, en mémoire) avec un schéma reconstitué à la main
// (rôles, auth.uid() lisant request.jwt.claim.sub, tables profiles / communities / community_members /
// events / event_invitations / event_attendees, les fonctions current_profile_id / community_member_role
// de supabase-communities.sql, la policy DELETE de community_members du fichier de gouvernance). Ce n'est
// PAS la base Supabase : le test prouve que la syntaxe est valide et que le comportement décrit est
// obtenu sur ce schéma ; il ne remplace pas un essai sur un projet de test.
// ============================================================================

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-remove-community-member-cleanup-events-fix.sql"), "utf8");

const id = (prefix, n) => `${prefix}0000000-0000-0000-0000-00000000000${n}`;
const U = (n) => id("0", n); // auth.users
const P = (n) => id("1", n); // profiles
const C1 = id("2", 1);
const C2 = id("2", 2);
const M = (n) => id("3", n); // community_members
const E = (n) => id("4", n); // events
const I = (n) => id("5", n); // event_invitations

// 1 = owner, 2 = admin, 3 = admin (2e), 4 = modérateur, 5 = membre (cible), 6 = membre sans événement,
// 7 = admin banni, 8 = membre d'une AUTRE communauté (c2)
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

  create table public.profiles (
    id uuid primary key, user_id uuid unique, name text,
    banned_at timestamptz, suspended_until timestamptz
  );
  create function public.current_profile_id() returns uuid language sql stable security definer set search_path = public
    as $$ select id from profiles where user_id = auth.uid() $$;

  create table public.communities (id uuid primary key, name text not null);
  create table public.community_members (
    id uuid primary key default gen_random_uuid(),
    community_id uuid not null references public.communities(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    role text not null default 'member' check (role in ('owner','admin','moderator','member')),
    joined_at timestamptz default now(),
    unique (community_id, profile_id)
  );
  alter table public.community_members enable row level security;
  create function public.community_member_role(p_community_id uuid, p_profile_id uuid)
    returns text language sql stable security definer set search_path = public as $$
    select role from community_members where community_id = p_community_id and profile_id = p_profile_id $$;

  create table public.events (
    id uuid primary key,
    community_id uuid references public.communities(id) on delete set null,
    visibility text not null default 'public' check (visibility in ('public','community','private')),
    event_date timestamptz not null,
    canceled_at timestamptz
  );
  create table public.event_invitations (
    id uuid primary key,
    event_id uuid not null references public.events(id) on delete cascade,
    invited_by uuid not null references public.profiles(id) on delete cascade,
    invited_profile_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending','accepted','declined')),
    unique (event_id, invited_profile_id)
  );
  create table public.event_attendees (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'going' check (status in ('going','interested','not_going','waitlisted')),
    unique (event_id, profile_id)
  );
  alter table public.event_invitations enable row level security;
  alter table public.event_attendees enable row level security;
  -- Les policies ci-dessous reproduisent le trou documenté : aucune ne permet au staff de communauté d'agir
  -- pour un tiers. Le DELETE direct d'event_attendees n'est ouvert qu'à soi-même.
  create policy "se retirer" on public.event_attendees for delete
    using (profile_id = public.current_profile_id());
  create policy "lecture" on public.event_attendees for select using (true);
  create policy "lecture" on public.event_invitations for select using (true);
  create policy "lecture" on public.community_members for select using (true);

  -- Trigger de l'effet de bord : on compte les promotions de liste d'attente déclenchées par les DELETE.
  create table public.waitlist_log (event_id uuid);
  create function public.log_attendee_delete() returns trigger language plpgsql security definer set search_path = public as $$
  begin insert into waitlist_log values (old.event_id); return old; end $$;
  create trigger trg_log after delete on public.event_attendees for each row execute function public.log_attendee_delete();

  -- Policy DELETE de community_members : copie de supabase-community-event-governance-banned-staff-fix.sql.
  create function public.community_would_be_orphaned_by_leaving(p_community_id uuid, p_leaving_profile_id uuid)
    returns boolean language sql stable security definer set search_path = public as $$
    select community_member_role(p_community_id, p_leaving_profile_id) in ('owner','admin')
      and not exists (select 1 from community_members cm where cm.community_id = p_community_id
        and cm.profile_id <> p_leaving_profile_id and cm.role in ('owner','admin')) $$;
  create policy "Quitter ou etre retire selon la hierarchie" on public.community_members for delete
  using (
    (
      (profile_id = current_profile_id() and not community_would_be_orphaned_by_leaving(community_id, current_profile_id()))
      or (community_member_role(community_id, current_profile_id()) = 'owner' and profile_id <> current_profile_id())
      or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
    )
    and not exists (
      select 1 from profiles p where p.id = current_profile_id()
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
  );
`;

const SEED = `
  insert into profiles (id, user_id, name, banned_at) values
    ('${P(1)}', '${U(1)}', 'Owner', null), ('${P(2)}', '${U(2)}', 'Admin', null), ('${P(3)}', '${U(3)}', 'Admin2', null),
    ('${P(4)}', '${U(4)}', 'Modo', null), ('${P(5)}', '${U(5)}', 'Membre', null), ('${P(6)}', '${U(6)}', 'Membre2', null),
    ('${P(7)}', '${U(7)}', 'AdminBanni', now()), ('${P(8)}', '${U(8)}', 'AutreCommu', null);
  insert into communities values ('${C1}', 'C1'), ('${C2}', 'C2');
  insert into community_members (id, community_id, profile_id, role) values
    ('${M(1)}', '${C1}', '${P(1)}', 'owner'), ('${M(2)}', '${C1}', '${P(2)}', 'admin'), ('${M(3)}', '${C1}', '${P(3)}', 'admin'),
    ('${M(4)}', '${C1}', '${P(4)}', 'moderator'), ('${M(5)}', '${C1}', '${P(5)}', 'member'), ('${M(6)}', '${C1}', '${P(6)}', 'member'),
    ('${M(7)}', '${C1}', '${P(7)}', 'admin'), ('${M(8)}', '${C2}', '${P(8)}', 'owner'), ('${M(9)}', '${C2}', '${P(5)}', 'member');

  -- Événements : 1 = community/futur (nettoyé), 2 = community/futur/annulé (non nettoyé), 3 = community/passé (non),
  -- 4 = public/futur (non), 5 = community/futur d'une AUTRE communauté (non), 6 = community/futur (nettoyé, invitation)
  insert into events (id, community_id, visibility, event_date, canceled_at) values
    ('${E(1)}', '${C1}', 'community', now() + interval '7 days', null),
    ('${E(2)}', '${C1}', 'community', now() + interval '7 days', now()),
    ('${E(3)}', '${C1}', 'community', now() - interval '7 days', null),
    ('${E(4)}', '${C1}', 'public', now() + interval '7 days', null),
    ('${E(5)}', '${C2}', 'community', now() + interval '7 days', null),
    ('${E(6)}', '${C1}', 'community', now() + interval '7 days', null);
  insert into event_attendees (event_id, profile_id, status) values
    ('${E(1)}', '${P(5)}', 'going'), ('${E(2)}', '${P(5)}', 'going'), ('${E(3)}', '${P(5)}', 'going'),
    ('${E(4)}', '${P(5)}', 'going'), ('${E(5)}', '${P(5)}', 'going'), ('${E(6)}', '${P(5)}', 'waitlisted'),
    ('${E(1)}', '${P(6)}', 'going');
  insert into event_invitations (id, event_id, invited_by, invited_profile_id, status) values
    ('${I(1)}', '${E(1)}', '${P(1)}', '${P(5)}', 'pending'),  -- sur E1 : déclinée
    ('${I(2)}', '${E(2)}', '${P(1)}', '${P(5)}', 'pending'),  -- événement annulé : intacte
    ('${I(3)}', '${E(3)}', '${P(1)}', '${P(5)}', 'pending'),  -- événement passé : intacte
    ('${I(4)}', '${E(4)}', '${P(1)}', '${P(5)}', 'pending'),  -- événement public : intacte
    ('${I(5)}', '${E(5)}', '${P(8)}', '${P(5)}', 'pending'),  -- autre communauté : intacte
    ('${I(6)}', '${E(6)}', '${P(1)}', '${P(5)}', 'accepted'), -- déjà acceptée : inchangée
    ('${I(7)}', '${E(1)}', '${P(1)}', '${P(6)}', 'pending');  -- autre membre : intacte
`;

let db;

// Exécute `fn` en tant que l'utilisateur `n` (rôle authenticated, auth.uid() = U(n)), comme PostgREST.
async function asUser(n, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U(n)}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const removeAs = (n, memberId) => asUser(n, () => db.query("select remove_community_member_and_cleanup_events($1)", [memberId]));
const q = async (sql) => (await db.query(sql)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
});
afterAll(async () => { await db.close(); });

async function reseed() {
  await db.exec("truncate table waitlist_log, event_attendees, event_invitations, events, community_members, communities, profiles cascade;");
  await db.exec(SEED);
}

describe("supabase-remove-community-member-cleanup-events-fix.sql", () => {
  it("le fichier s'exécute et est idempotent (create or replace deux fois de suite)", async () => {
    await db.exec(SQL);
    await db.exec(SQL);
    const fn = await q("select prosecdef from pg_proc where proname = 'remove_community_member_and_cleanup_events'");
    expect(fn).toEqual([{ prosecdef: true }]);
  });

  it("n'est pas appelable par anon, l'est par authenticated", async () => {
    const r = await q(`select has_function_privilege('anon', 'remove_community_member_and_cleanup_events(uuid)', 'execute') as anon_peut,
      has_function_privilege('authenticated', 'remove_community_member_and_cleanup_events(uuid)', 'execute') as auth_peut`);
    expect(r).toEqual([{ anon_peut: false, auth_peut: true }]);
  });

  it("sans le correctif, un owner ne peut PAS nettoyer lui-même les lignes d'un tiers (le trou documenté existe bien)", async () => {
    await reseed();
    await asUser(1, async () => {
      await db.query(`delete from event_attendees where profile_id = '${P(5)}'`); // 0 ligne, pas d'erreur
      await db.query("update event_invitations set status = 'declined' where invited_profile_id = $1", [P(5)]);
    });
    expect((await q(`select count(*)::int as n from event_attendees where profile_id = '${P(5)}'`))[0].n).toBe(6);
  });

  it("un owner exclut un membre : invitations pending déclinées, participations retirées, membre supprimé — événements hors périmètre intacts", async () => {
    await reseed();
    await removeAs(1, M(5));

    expect(await q(`select count(*)::int as n from community_members where id = '${M(5)}'`)).toEqual([{ n: 0 }]);
    // Autre appartenance du même profil (c2) : intacte.
    expect(await q(`select count(*)::int as n from community_members where id = '${M(9)}'`)).toEqual([{ n: 1 }]);

    const inv = Object.fromEntries((await q("select id, status from event_invitations")).map((r) => [r.id, r.status]));
    expect(inv[I(1)]).toBe("declined");   // pending, community, futur
    expect(inv[I(2)]).toBe("pending");    // événement annulé
    expect(inv[I(3)]).toBe("pending");    // événement passé
    expect(inv[I(4)]).toBe("pending");    // événement public
    expect(inv[I(5)]).toBe("pending");    // autre communauté
    expect(inv[I(6)]).toBe("accepted");   // déjà acceptée
    expect(inv[I(7)]).toBe("pending");    // autre profil

    const att = (await q(`select event_id from event_attendees where profile_id = '${P(5)}' order by event_id`)).map((r) => r.event_id);
    expect(att).toEqual([E(2), E(3), E(4), E(5)]); // E1 (going) et E6 (waitlisted) retirés
    // Les participations d'un autre profil ne bougent pas.
    expect(await q(`select count(*)::int as n from event_attendees where profile_id = '${P(6)}'`)).toEqual([{ n: 1 }]);
    // Les triggers sur event_attendees se déclenchent bien (promotion de liste d'attente).
    expect((await q("select count(*)::int as n from waitlist_log"))[0].n).toBe(2);
  });

  it("un admin exclut un modérateur ou un membre ; un admin ne peut PAS exclure un autre admin ni l'owner (rien n'est modifié)", async () => {
    await reseed();
    await expect(removeAs(2, M(3))).rejects.toThrow(/Droits insuffisants/);
    await expect(removeAs(2, M(1))).rejects.toThrow(/Droits insuffisants/);
    expect((await q("select count(*)::int as n from community_members where community_id = '" + C1 + "'"))[0].n).toBe(7);
    await removeAs(2, M(4));
    await removeAs(2, M(5));
    expect(await q(`select count(*)::int as n from community_members where id in ('${M(4)}','${M(5)}')`)).toEqual([{ n: 0 }]);
  });

  it("un simple membre, un modérateur ou un compte d'une autre communauté ne peuvent exclure personne ; rien n'est nettoyé", async () => {
    await reseed();
    await expect(removeAs(6, M(5))).rejects.toThrow(/Droits insuffisants/);
    await expect(removeAs(4, M(5))).rejects.toThrow(/Droits insuffisants/);
    await expect(removeAs(8, M(5))).rejects.toThrow(/Droits insuffisants/); // owner de C2, étranger à C1
    expect(await q(`select status from event_invitations where id = '${I(1)}'`)).toEqual([{ status: "pending" }]);
    expect((await q(`select count(*)::int as n from event_attendees where profile_id = '${P(5)}'`))[0].n).toBe(6);
    expect(await q(`select count(*)::int as n from community_members where id = '${M(5)}'`)).toEqual([{ n: 1 }]);
  });

  it("un admin banni ne peut rien exclure", async () => {
    await reseed();
    await expect(removeAs(7, M(5))).rejects.toThrow(/Droits insuffisants/);
    expect(await q(`select count(*)::int as n from community_members where id = '${M(5)}'`)).toEqual([{ n: 1 }]);
  });

  it("un membre peut se retirer lui-même (nettoyage inclus) ; le dernier owner/admin ne le peut pas", async () => {
    await reseed();
    await removeAs(5, M(5));
    expect(await q(`select count(*)::int as n from community_members where id = '${M(5)}'`)).toEqual([{ n: 0 }]);
    expect(await q(`select status from event_invitations where id = '${I(1)}'`)).toEqual([{ status: "declined" }]);

    await reseed();
    // Reste un seul owner/admin : l'owner (P1) ne peut pas se retirer.
    await db.exec(`delete from community_members where id in ('${M(2)}','${M(3)}','${M(7)}')`);
    await expect(removeAs(1, M(1))).rejects.toThrow(/Droits insuffisants/);
    expect(await q(`select count(*)::int as n from community_members where id = '${M(1)}'`)).toEqual([{ n: 1 }]);
  });

  it("membre introuvable (déjà exclu) et appelant non authentifié sont refusés", async () => {
    await reseed();
    await removeAs(1, M(5));
    await expect(removeAs(1, M(5))).rejects.toThrow(/Membre introuvable/);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '', false);`);
    await expect(db.query("select remove_community_member_and_cleanup_events($1)", [M(6)])).rejects.toThrow(/Non authentifie/);
    await db.exec("reset role");
  });

  it("atomique : si le nettoyage échoue, le membre reste membre et rien n'est modifié", async () => {
    await reseed();
    // Un trigger qui fait échouer la suppression d'une participation simule une panne en cours de route.
    await db.exec(`
      create function public.boom() returns trigger language plpgsql as $$ begin raise exception 'panne simulee'; end $$;
      create trigger trg_boom before delete on public.event_attendees for each row execute function public.boom();
    `);
    await expect(removeAs(1, M(5))).rejects.toThrow(/panne simulee/);
    await db.exec("drop trigger trg_boom on public.event_attendees; drop function public.boom();");
    expect(await q(`select count(*)::int as n from community_members where id = '${M(5)}'`)).toEqual([{ n: 1 }]);
    expect(await q(`select status from event_invitations where id = '${I(1)}'`)).toEqual([{ status: "pending" }]);
    expect((await q(`select count(*)::int as n from event_attendees where profile_id = '${P(5)}'`))[0].n).toBe(6);
  });
});
