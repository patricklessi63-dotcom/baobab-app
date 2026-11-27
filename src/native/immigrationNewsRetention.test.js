// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// SQL-46 (supabase-immigration-news-retention.sql) sur un SCHEMA FACTICE (PGlite = PostgreSQL en
// WebAssembly) : colonnes reelles de supabase-immigration-news.sql et -2.sql, pg_cron simule par une
// table cron.job. Honnetete : ce n'est pas la base Supabase (un seul role, pas de vrai planificateur) ;
// ce test prouve la syntaxe, la purge, le declencheur et la planification enregistree.

const SQL46 = fs.readFileSync(path.join(process.cwd(), "supabase-immigration-news-retention.sql"), "utf8");
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;

const SCHEMA = `
  create role anon nologin; create role authenticated nologin;
  create table profiles (id uuid primary key);
  create table immigration_news (
    id uuid primary key default gen_random_uuid(),
    source text not null check (source in ('ircc', 'asfc')),
    source_label text not null,
    external_id text not null,
    title text not null,
    summary text,
    category text not null default 'general',
    published_at timestamptz not null,
    source_url text not null,
    fetched_at timestamptz not null default now(),
    unique (source, external_id)
  );
  create table immigration_news_fetch_log (
    id uuid primary key default gen_random_uuid(),
    source text not null check (source in ('ircc', 'asfc')),
    fetched_at timestamptz not null default now(),
    ok boolean not null,
    items_count int,
    error text
  );
  create table immigration_news_favorites (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    news_id uuid not null references immigration_news(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (profile_id, news_id)
  );
  create schema cron;
  create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text, active boolean default true);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as
    $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid::bigint $$;
  create function cron.unschedule(n text) returns boolean language sql as
    $$ with d as (delete from cron.job where jobname = n returning 1) select exists (select 1 from d) $$;
`;

// Ecriture "brute" (declencheurs coupes) pour poser des lignes anciennes, comme celles deja en base.
async function seedNews(ext, daysAgo, title = ext) {
  await db.exec("set session_replication_role = replica");
  try {
    const [{ id }] = await q(
      `insert into immigration_news (source, source_label, external_id, title, published_at, source_url)
       values ('ircc', 'IRCC', $1, $2, now() - ($3 || ' days')::interval, 'https://www.canada.ca/' || $1) returning id`,
      [ext, title, String(daysAgo)]
    );
    return id;
  } finally {
    await db.exec("set session_replication_role = origin");
  }
}
async function seedLog(source, daysAgo, ok) {
  const [{ id }] = await q(
    "insert into immigration_news_fetch_log (source, fetched_at, ok) values ($1, now() - ($2 || ' days')::interval, $3) returning id",
    [source, String(daysAgo), ok]
  );
  return id;
}
// Meme requete que fetch-immigration-news : upsert on conflict (source, external_id).
async function upsertFromFeed(ext, daysAgo, title) {
  await db.query(
    `insert into immigration_news (source, source_label, external_id, title, published_at, source_url)
     values ('ircc', 'IRCC', $1, $2, now() - ($3 || ' days')::interval, 'https://www.canada.ca/' || $1)
     on conflict (source, external_id) do update set title = excluded.title, fetched_at = excluded.fetched_at`,
    [ext, title, String(daysAgo)]
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.query("insert into profiles (id) values ($1)", [U(1)]);
  await db.exec(SQL46);
}, 120000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("delete from immigration_news_favorites; delete from immigration_news; delete from immigration_news_fetch_log;");
});

describe("SQL-46 : le fichier s'execute et se rejoue", () => {
  it("rejoue sans doublon : une seule tache planifiee le dimanche soir (lundi 04:00 UTC), un seul declencheur", async () => {
    await db.exec(SQL46);
    expect(await q("select jobname, schedule, command from cron.job")).toEqual([
      { jobname: "baobab-purge-immigration-news", schedule: "0 4 * * 1", command: "select public.purge_old_immigration_news()" },
    ]);
    const [{ n }] = await q("select count(*)::int as n from pg_trigger where tgname = 'trg_immigration_news_skip_old'");
    expect(n).toBe(1);
  });
  it("le fichier est entierement ASCII", () => {
    expect([...SQL46].filter((c) => c.charCodeAt(0) > 127)).toEqual([]);
  });
  it("aucun membre ne peut lancer la purge (execution retiree a public, anon, authenticated)", async () => {
    for (const role of ["anon", "authenticated"]) {
      const [{ ok }] = await q(`select has_function_privilege('${role}', 'public.purge_old_immigration_news()', 'execute') as ok`);
      expect(ok).toBe(false);
    }
  });
});

describe("purge de fin de semaine", () => {
  it("efface les actualites de plus de 7 jours, garde les recentes et celles mises en favori (et le favori lui-meme)", async () => {
    await seedNews("recente", 2);
    await seedNews("limite", 6.9);
    await seedNews("ancienne", 10);
    await seedNews("tres-ancienne", 40);
    const fav = await seedNews("ancienne-favorite", 20);
    await db.query("insert into immigration_news_favorites (profile_id, news_id) values ($1, $2)", [U(1), fav]);

    const [res] = await q("select * from purge_old_immigration_news()");
    expect(res.news_deleted).toBe(2);
    expect((await q("select external_id from immigration_news order by external_id")).map((r) => r.external_id))
      .toEqual(["ancienne-favorite", "limite", "recente"]);
    expect((await q("select news_id from immigration_news_favorites"))).toEqual([{ news_id: fav }]);
  });

  it("journal : efface au-dela de 30 jours mais garde la derniere ligne et la derniere reussite de chaque source", async () => {
    // ircc en panne depuis longtemps : sa derniere ligne (echec) et sa derniere reussite doivent rester,
    // sinon l'app ne pourrait plus signaler la panne.
    await seedLog("ircc", 50, true);
    const irccLastOk = await seedLog("ircc", 40, true);
    const irccLast = await seedLog("ircc", 35, false);
    await seedLog("asfc", 40, true);
    await seedLog("asfc", 31, false);
    const asfcRecent = await seedLog("asfc", 2, true);
    const asfcRecentKo = await seedLog("asfc", 1, false);

    const [res] = await q("select * from purge_old_immigration_news()");
    expect(res.logs_deleted).toBe(3);
    const kept = (await q("select id from immigration_news_fetch_log")).map((r) => r.id).sort();
    expect(kept).toEqual([irccLastOk, irccLast, asfcRecent, asfcRecentKo].sort());
  });

  it("rien a effacer : 0 et 0, sans erreur", async () => {
    await seedNews("recente", 1);
    await seedLog("ircc", 1, true);
    expect(await q("select * from purge_old_immigration_news()")).toEqual([{ news_deleted: 0, logs_deleted: 0 }]);
  });
});

describe("la recuperation (toutes les 6 h) ne reinsere pas ce que la purge a efface", () => {
  it("une entree du flux de plus de 7 jours est ignoree ; une recente est inseree", async () => {
    await upsertFromFeed("vieille-du-flux", 12, "Vieille");
    await upsertFromFeed("du-jour", 0, "Du jour");
    expect((await q("select external_id from immigration_news")).map((r) => r.external_id)).toEqual(["du-jour"]);
  });

  it("une entree recente deja en base est toujours mise a jour par l'upsert", async () => {
    await upsertFromFeed("du-jour", 1, "Titre 1");
    await upsertFromFeed("du-jour", 1, "Titre corrige");
    expect(await q("select title from immigration_news")).toEqual([{ title: "Titre corrige" }]);
  });

  it("une ancienne gardee pour un favori : l'upsert ne plante pas et ne la change pas", async () => {
    const fav = await seedNews("ancienne-favorite", 20, "Titre d'origine");
    await db.query("insert into immigration_news_favorites (profile_id, news_id) values ($1, $2)", [U(1), fav]);
    await upsertFromFeed("ancienne-favorite", 20, "Autre titre");
    expect(await q("select title from immigration_news")).toEqual([{ title: "Titre d'origine" }]);
    expect((await q("select count(*)::int as n from immigration_news_favorites"))[0].n).toBe(1);
  });
});

describe("prerequis et retour arriere", () => {
  it("sans les tables d'actualites : refus clair, rien n'est cree", async () => {
    const bare = new PGlite();
    try {
      let err = null;
      try { await bare.exec(SQL46); } catch (e) { err = String(e.message); }
      expect(err).toContain("prerequis manquant");
      const [{ n }] = (await bare.query("select count(*)::int as n from pg_proc where proname = 'purge_old_immigration_news'")).rows;
      expect(n).toBe(0);
    } finally {
      await bare.close();
    }
  });

  // En DERNIER : retire tout.
  it("les commandes de retour arriere du fichier retirent la tache, le declencheur et les fonctions", async () => {
    const rollback = SQL46.split("-- Retour arriere :").pop()
      .split("\n").filter((l) => /^-- (select|drop)/.test(l)).map((l) => l.slice(3)).join("\n");
    expect(rollback.split("\n")).toHaveLength(4);
    await db.exec(rollback);
    expect(await q("select jobname from cron.job")).toEqual([]);
    expect((await q("select count(*)::int as n from pg_trigger where tgname = 'trg_immigration_news_skip_old'"))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from pg_proc where proname in ('purge_old_immigration_news', 'immigration_news_skip_old')"))[0].n).toBe(0);
    await upsertFromFeed("vieille-du-flux", 12, "Vieille");
    expect((await q("select count(*)::int as n from immigration_news"))[0].n).toBe(1);
  });
});
