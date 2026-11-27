-- ============================================================================
-- SQL-46 : Actualites IRCC/ASFC, les anciennes s'effacent chaque fin de semaine
-- (demande du proprietaire, 27/11/2026).
--
-- Prerequis : supabase-immigration-news.sql (tables immigration_news,
-- immigration_news_fetch_log, cron de recuperation toutes les 6 h) et
-- supabase-immigration-news-2.sql (immigration_news_favorites). Un garde-fou
-- s'arrete avec un message clair s'ils manquent. Relancable sans effet de bord.
--
-- 1. purge_old_immigration_news() : efface les actualites publiees il y a plus
--    de 7 jours, SAUF celles qu'un membre a mises en favori (la cle etrangere
--    des favoris est en "on delete cascade" : sans cette exception, la purge
--    supprimerait aussi les favoris des membres). Efface aussi le journal de
--    recuperation de plus de 30 jours, en gardant toujours la derniere ligne
--    et la derniere reussite de chaque source (l'app s'en sert pour signaler
--    une source en panne : les effacer masquerait la panne).
-- 2. Declencheur trg_immigration_news_skip_old : une entree publiee il y a
--    plus de 7 jours n'est plus inseree. Sans lui, la recuperation (toutes les
--    6 h, 30 entrees par source) reinsererait des la nuit suivante ce que la
--    purge vient d'effacer. Aucun redeploiement de la fonction
--    fetch-immigration-news n'est necessaire. (Son journal compte encore les
--    entrees lues, ignorees comprises.)
-- 3. Cron baobab-purge-immigration-news : chaque lundi 04:00 UTC, soit le
--    dimanche 23 h a Toronto/Montreal en heure normale (minuit en heure
--    avancee).
--
-- Une actualite vit donc au plus jusqu'au deuxieme dimanche apres sa
-- publication (moins de 14 jours) ; l'app masque deja tout ce qui depasse 14
-- jours (src/lib/immigrationNewsRetention.js), meme avant ce fichier.
--
-- Retour arriere : en bas du fichier. Les lignes effacees ne reviennent pas,
-- mais ce sont des copies de flux publics officiels, sans donnee personnelle.
-- ============================================================================

do $$
begin
  if to_regclass('public.immigration_news') is null
     or to_regclass('public.immigration_news_fetch_log') is null
     or to_regclass('public.immigration_news_favorites') is null
     or to_regclass('cron.job') is null then
    raise exception 'SQL-46 : prerequis manquant, executer d abord supabase-immigration-news.sql et supabase-immigration-news-2.sql.';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Purge
-- ----------------------------------------------------------------------------
create or replace function public.purge_old_immigration_news()
returns table (news_deleted int, logs_deleted int)
language plpgsql
security definer
set search_path = public
as $$
declare
  n_news int;
  n_logs int;
begin
  delete from immigration_news n
   where n.published_at < now() - interval '7 days'
     and not exists (select 1 from immigration_news_favorites f where f.news_id = n.id);
  get diagnostics n_news = row_count;

  delete from immigration_news_fetch_log l
   where l.fetched_at < now() - interval '30 days'
     and l.id not in (
       select distinct on (source) id from immigration_news_fetch_log order by source, fetched_at desc
     )
     and l.id not in (
       select distinct on (source) id from immigration_news_fetch_log where ok order by source, fetched_at desc
     );
  get diagnostics n_logs = row_count;

  return query select n_news, n_logs;
end;
$$;

-- Reservee au cron (role postgres) : aucun membre ne peut declencher la purge.
revoke all on function public.purge_old_immigration_news() from public;
revoke all on function public.purge_old_immigration_news() from anon;
revoke all on function public.purge_old_immigration_news() from authenticated;

-- ----------------------------------------------------------------------------
-- 2. Les entrees anciennes ne sont plus reinserees
-- ----------------------------------------------------------------------------
create or replace function public.immigration_news_skip_old()
returns trigger
language plpgsql
as $$
begin
  -- Retourner NULL dans un BEFORE INSERT ignore la ligne, y compris dans un
  -- "insert ... on conflict do update" (l'upsert de fetch-immigration-news).
  if new.published_at < now() - interval '7 days' then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_immigration_news_skip_old on immigration_news;
create trigger trg_immigration_news_skip_old
  before insert on immigration_news
  for each row execute function public.immigration_news_skip_old();

-- ----------------------------------------------------------------------------
-- 3. Chaque fin de semaine
-- ----------------------------------------------------------------------------
-- pg_cron : deja active par supabase-immigration-news.sql (verifie par le garde-fou).

select cron.unschedule('baobab-purge-immigration-news')
where exists (select 1 from cron.job where jobname = 'baobab-purge-immigration-news');

select cron.schedule(
  'baobab-purge-immigration-news',
  '0 4 * * 1', -- lundi 04:00 UTC = dimanche 23 h a Toronto (heure normale)
  'select public.purge_old_immigration_news()'
);

-- ----------------------------------------------------------------------------
-- Verification (lecture seule) :
-- select jobname, schedule, active from cron.job where jobname in ('baobab-fetch-immigration-news', 'baobab-purge-immigration-news');
--   -> 2 lignes, actives (0 */6 * * * et 0 4 * * 1)
-- select tgname from pg_trigger where tgname = 'trg_immigration_news_skip_old';
-- select source, max(fetched_at) filter (where ok) as derniere_reussite, max(fetched_at) as dernier_essai
--   from immigration_news_fetch_log group by source;
--   -> la recuperation quotidienne tourne si derniere_reussite date de moins de 6 h
-- Apercu de la prochaine purge (lecture seule) :
-- select count(*) from immigration_news n where n.published_at < now() - interval '7 days'
--   and not exists (select 1 from immigration_news_favorites f where f.news_id = n.id);
--
-- Retour arriere :
-- select cron.unschedule('baobab-purge-immigration-news');
-- drop trigger if exists trg_immigration_news_skip_old on immigration_news;
-- drop function if exists public.immigration_news_skip_old();
-- drop function if exists public.purge_old_immigration_news();
-- ============================================================================
