// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-premium-stats.sql (SQL-40) sur un SCHÉMA FACTICE (PGlite : PostgreSQL en
// WebAssembly), SQL-37 chargé pour de vrai juste avant. Honnêteté : ce n'est pas la base Supabase ;
// is_premium() est recopiée de supabase-premium.sql, current_profile_id() et is_admin_or_above() sont des
// interrupteurs de test. Les rôles `anon` / `authenticated` sont réels : les privilèges sont joués.

const SQL37 = fs.readFileSync(path.join(process.cwd(), "supabase-premium-entitlements.sql"), "utf8");
const SQL40 = fs.readFileSync(path.join(process.cwd(), "supabase-premium-stats.sql"), "utf8");

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ME = id(1);        // abonné·e Premium, auteur·e des publications mesurées
const FREE = id(2);
const OTHER = id(3);     // autre abonné·e Premium, avec ses propres chiffres
const LAPSED = id(4);    // abonnement résilié
const FAN_A = id(10);
const FAN_B = id(11);
const P_RECENT = id(100), P_OLD = id(101), P_TODAY = id(102), P_OTHER = id(103);

const PREREQ = `
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table public.profiles (id uuid primary key);
  create table public.posts (id uuid primary key, author_id uuid not null, body text not null, created_at timestamptz default now());
  create table public.post_likes (post_id uuid not null references public.posts(id) on delete cascade, profile_id uuid not null, created_at timestamptz default now());
  create table public.post_comments (post_id uuid not null references public.posts(id) on delete cascade, author_id uuid not null, created_at timestamptz default now());
  create table public.follows (from_id uuid not null, to_id uuid not null, created_at timestamptz default now());
  create table public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id),
    stripe_customer_id text not null default 'cus',
    plan text, status text not null, current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create or replace function public.is_premium(p_profile_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from subscriptions where profile_id = p_profile_id and status in ('active','trialing')
      and (current_period_end is null or current_period_end > now()));
  $$;
  create or replace function public.is_admin_or_above() returns boolean language sql stable as $$ select false $$;
  create or replace function public.current_profile_id() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant select on public.posts, public.post_likes, public.post_comments, public.follows to authenticated;
`;

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(PREREQ);
  await db.exec(`
    insert into public.profiles values ('${ME}'),('${FREE}'),('${OTHER}'),('${LAPSED}'),('${FAN_A}'),('${FAN_B}');
    insert into public.subscriptions (profile_id, plan, status, current_period_end) values
      ('${ME}', 'monthly', 'active', now() + interval '10 days'),
      ('${OTHER}', 'monthly', 'active', now() + interval '10 days'),
      ('${LAPSED}', 'monthly', 'canceled', now() - interval '1 day');

    -- Mes publications : une d'il y a 3 jours, une d'il y a 40 jours, une d'aujourd'hui sans réaction.
    insert into public.posts (id, author_id, body, created_at) values
      ('${P_RECENT}', '${ME}', 'Ma publication récente', now() - interval '3 days'),
      ('${P_OLD}',    '${ME}', 'Ma publication ancienne', now() - interval '40 days'),
      ('${P_TODAY}',  '${ME}', 'Écrite aujourd''hui', now()),
      ('${P_OTHER}',  '${OTHER}', 'Publication de quelqu''un d''autre', now() - interval '1 day');

    -- J'aime : 2 récents d'autres personnes + 1 de moi-même (exclu) sur P_RECENT ; 1 ancien (40 j) sur P_OLD ;
    -- 5 j'aime sur la publication d'une autre personne (ne doivent jamais compter pour ME).
    insert into public.post_likes (post_id, profile_id, created_at) values
      ('${P_RECENT}', '${FAN_A}', now() - interval '2 days'),
      ('${P_RECENT}', '${FAN_B}', now() - interval '1 day'),
      ('${P_RECENT}', '${ME}',    now() - interval '1 day'),
      ('${P_OLD}',    '${FAN_A}', now() - interval '39 days'),
      ('${P_OTHER}',  '${FAN_A}', now()), ('${P_OTHER}', '${FAN_B}', now()), ('${P_OTHER}', '${ME}', now());

    -- Commentaires : 1 d'une autre personne (compté), 1 des miens (exclu).
    insert into public.post_comments (post_id, author_id, created_at) values
      ('${P_RECENT}', '${FAN_A}', now() - interval '2 days'),
      ('${P_RECENT}', '${ME}',    now() - interval '1 day');

    -- Abonnés : un d'il y a 2 jours, un d'il y a 60 jours.
    insert into public.follows (from_id, to_id, created_at) values
      ('${FAN_A}', '${ME}', now() - interval '2 days'),
      ('${FAN_B}', '${ME}', now() - interval '60 days');
  `);
  await db.exec(SQL37);
  await db.exec(SQL40);
});
afterAll(async () => { await db.close(); });

async function as(uid, fn) {
  await db.exec(`select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('test.uid', '', false);"); }
}
const stats = async (uid, days) => as(uid, async () => {
  const { rows } = days === undefined
    ? await db.query("select public.my_creator_stats() as s")
    : await db.query("select public.my_creator_stats($1) as s", [days]);
  return typeof rows[0].s === "string" ? JSON.parse(rows[0].s) : rows[0].s;
});

describe("SQL-40 — prérequis et conception", () => {
  it("s'arrête avec un message clair si SQL-37 n'est pas passé", async () => {
    const empty = new PGlite();
    await empty.exec("create function public.current_profile_id() returns uuid language sql as $$ select null::uuid $$;");
    await expect(empty.exec(SQL40)).rejects.toThrow(/has_premium_feature\(\) introuvable/);
    await empty.close();
  });

  it("garde-fou de conception : aucune table créée, aucune visite enregistrée", () => {
    const code = SQL40.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/create\s+table/i);
    expect(code).not.toMatch(/insert\s+into\s+public\.(?!premium_entitlements)/i);
    expect(code).not.toMatch(/profile_views|visits|viewer/i);
  });

  it("ajoute l'avantage au catalogue", async () => {
    const { rows } = await db.query("select active from public.premium_entitlements where key = 'creator_stats'");
    expect(rows).toEqual([{ active: true }]);
  });
});

describe("chiffres exacts", () => {
  it("compte les interactions reçues sur 30 jours, sans compter les miennes ni celles des autres publications", async () => {
    const s = await stats(ME);
    expect(s.period_days).toBe(30);
    expect(s.posts_total).toBe(3);
    expect(s.posts_period).toBe(2);        // la publication de 40 jours est hors période
    expect(s.likes_total).toBe(3);         // 2 + 1 ancien ; mon propre j'aime et ceux de la publication d'autrui exclus
    expect(s.likes_period).toBe(2);
    expect(s.comments_total).toBe(1);      // mon propre commentaire exclu
    expect(s.comments_period).toBe(1);
    expect(s.followers_total).toBe(2);
    expect(s.followers_period).toBe(1);
  });

  it("classe les publications par appréciation, sans celles qui n'ont reçu aucune réaction", async () => {
    const s = await stats(ME);
    expect(s.top_posts.map((p) => p.id)).toEqual([P_RECENT, P_OLD]);
    expect(s.top_posts[0]).toMatchObject({ likes: 2, comments: 1, score: 3, excerpt: "Ma publication récente" });
  });

  it("l'extrait est tronqué à 140 caractères", async () => {
    await db.exec(`insert into public.posts (id, author_id, body) values ('${id(500)}', '${ME}', '${"x".repeat(400)}');
                   insert into public.post_likes (post_id, profile_id) values ('${id(500)}', '${FAN_A}');`);
    const s = await stats(ME);
    const long = s.top_posts.find((p) => p.id === id(500));
    expect(long.excerpt).toHaveLength(140);
    await db.exec(`delete from public.posts where id = '${id(500)}'`);
  });

  it("renvoie une courbe hebdomadaire ordonnée qui couvre la période jusqu'à aujourd'hui", async () => {
    const s = await stats(ME);
    const weeks = s.weekly.map((w) => w.week);
    expect(weeks).toEqual([...weeks].sort());
    expect(weeks.length).toBeGreaterThanOrEqual(5);
    expect(weeks.length).toBeLessThanOrEqual(6);
    const last = s.weekly[s.weekly.length - 1];
    expect(last.posts).toBeGreaterThanOrEqual(1);        // la publication d'aujourd'hui
    const sum = (k) => s.weekly.reduce((n, w) => n + w[k], 0);
    expect(sum("posts")).toBeGreaterThanOrEqual(s.posts_period);
    expect(sum("likes")).toBeGreaterThanOrEqual(s.likes_period);
  });

  it("borne la période entre 7 et 90 jours", async () => {
    expect((await stats(ME, 1)).period_days).toBe(7);
    expect((await stats(ME, 1000)).period_days).toBe(90);
    expect((await stats(ME, 90)).likes_period).toBe(3);   // la période de 90 jours couvre le j'aime de 39 jours
    expect((await as(ME, async () => (await db.query("select public.my_creator_stats(null) as s")).rows[0].s)).period_days).toBe(30);
  });
});

describe("confidentialité", () => {
  it("chaque abonné·e ne voit que ses propres chiffres", async () => {
    const s = await stats(OTHER);
    expect(s.posts_total).toBe(1);
    expect(s.likes_total).toBe(3);         // FAN_A, FAN_B et ME ont aimé SA publication
    expect(s.followers_total).toBe(0);
    expect(s.top_posts.map((p) => p.id)).toEqual([P_OTHER]);
  });

  it("le résultat ne contient aucune identité : ni profils qui ont aimé, ni abonnés", async () => {
    const raw = JSON.stringify(await stats(ME));
    for (const who of [FAN_A, FAN_B, OTHER, FREE]) expect(raw).not.toContain(who);
    expect(raw).not.toContain(ME);
  });

  it("la fonction n'accepte aucun identifiant : impossible de viser un autre profil", async () => {
    await as(FREE, async () => {
      await expect(db.query("select public.my_creator_stats($1, $2)", [30, ME])).rejects.toThrow(/does not exist|function/i);
    });
  });
});

describe("droit vérifié côté serveur", () => {
  it("un compte gratuit est refusé, même s'il appelle directement la fonction", async () => {
    await as(FREE, async () => {
      await expect(db.query("select public.my_creator_stats()")).rejects.toThrow(/Reserve aux abonnes Premium/);
    });
  });

  it("un abonnement résilié est refusé", async () => {
    await as(LAPSED, async () => {
      await expect(db.query("select public.my_creator_stats()")).rejects.toThrow(/Reserve aux abonnes Premium/);
    });
  });

  it("sans compte connecté : refusé", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select public.my_creator_stats()")).rejects.toThrow(/Non connecte/);
    } finally { await db.exec("reset role"); }
  });

  it("un visiteur anonyme n'a aucun privilège", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select public.my_creator_stats()")).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("l'avantage désactivé au catalogue ferme la fonction pour tout le monde", async () => {
    await db.exec("update public.premium_entitlements set active = false where key = 'creator_stats'");
    try {
      await as(ME, async () => {
        await expect(db.query("select public.my_creator_stats()")).rejects.toThrow(/Reserve aux abonnes Premium/);
      });
    } finally {
      await db.exec("update public.premium_entitlements set active = true where key = 'creator_stats'");
    }
    expect((await stats(ME)).posts_total).toBe(3);
  });
});
