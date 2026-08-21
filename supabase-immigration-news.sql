-- ============================================================================
-- Onglet "Immigration & Intégration" — fil d'actualités officielles (IRCC +
-- ASFC uniquement, validé avec l'utilisateur — MIFI écarté, aucun flux RSS
-- trouvé). À exécuter APRÈS avoir déployé la Edge Function
-- fetch-immigration-news (supabase functions deploy fetch-immigration-news).
-- Réutilise le secret Vault "service_role_key" déjà créé pour
-- supabase-account-deletion.sql — si tu ne l'as jamais fait, voir l'étape
-- manuelle en bas de CE fichier.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table des publications indexées — jamais de texte intégral reformulé,
-- uniquement titre/résumé tels que fournis par la source + lien direct vers
-- la page officielle. "category" est une classification automatique par
-- mots-clés (voir Edge Function), affichée comme un simple regroupement
-- visuel, jamais présentée comme une catégorisation officielle.
-- ----------------------------------------------------------------------------
create table if not exists immigration_news (
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
create index if not exists idx_immigration_news_published on immigration_news(published_at desc);
alter table immigration_news enable row level security;

drop policy if exists "Lecture par les utilisateurs connectes" on immigration_news;
create policy "Lecture par les utilisateurs connectes"
on immigration_news for select
to authenticated
using (true);
-- Aucune policy INSERT/UPDATE/DELETE cliente : seule la Edge Function
-- (service_role, contourne RLS) écrit dans cette table.

-- ----------------------------------------------------------------------------
-- 2. Journal de récupération — traçabilité par source (item 4 de la spec :
-- "journalise la source et l'horodatage de récupération"), et permet
-- d'afficher "dernière mise à jour réussie" même si le fetch le plus récent
-- a échoué (jamais de masquage silencieux d'un échec).
-- ----------------------------------------------------------------------------
create table if not exists immigration_news_fetch_log (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ircc', 'asfc')),
  fetched_at timestamptz not null default now(),
  ok boolean not null,
  items_count int,
  error text
);
alter table immigration_news_fetch_log enable row level security;
drop policy if exists "Lecture par les utilisateurs connectes" on immigration_news_fetch_log;
create policy "Lecture par les utilisateurs connectes"
on immigration_news_fetch_log for select
to authenticated
using (true);

-- ----------------------------------------------------------------------------
-- 3. pg_cron + pg_net — actualisation toutes les 6 heures. Réutilise le
-- secret Vault "service_role_key" (déjà créé si tu as fait
-- supabase-account-deletion.sql).
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('baobab-fetch-immigration-news')
where exists (select 1 from cron.job where jobname = 'baobab-fetch-immigration-news');

select cron.schedule(
  'baobab-fetch-immigration-news',
  '0 */6 * * *', -- toutes les 6 heures
  $$
  select net.http_post(
    url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/fetch-immigration-news',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- ----------------------------------------------------------------------------
-- ÉTAPE MANUELLE (une seule fois, uniquement si tu n'as jamais fait
-- supabase-account-deletion.sql — sinon le secret existe déjà, ignore
-- cette étape) :
--   select vault.create_secret('TA_CLE_SERVICE_ROLE_ICI', 'service_role_key');
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, après avoir déployé la fonction et exécuté ce
-- fichier) :
-- select jobname, schedule, active from cron.job where jobname = 'baobab-fetch-immigration-news';
-- Test manuel immédiat (sans attendre 6h) :
--   select net.http_post(url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/fetch-immigration-news',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), 'Content-Type', 'application/json'));
-- select * from immigration_news_fetch_log order by fetched_at desc limit 5;
-- select count(*) from immigration_news;
-- ============================================================================
