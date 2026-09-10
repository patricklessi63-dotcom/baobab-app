-- ============================================================================
-- Rapporteur d'erreurs client — table `client_errors`
-- À exécuter dans Supabase : SQL Editor > New query. Additif, sans risque :
-- crée une table neuve, n'altère ni ne supprime aucun objet existant.
-- ============================================================================
-- CONTEXTE : le projet n'a AUCUN suivi d'erreurs en production. Si un
-- utilisateur tombe sur un bug JavaScript (exception non rattrapée, promesse
-- rejetée, crash de rendu React rattrapé par un ErrorBoundary), personne ne
-- le sait jamais. Cette table reçoit ces rapports depuis le client
-- (src/lib/errorReporter.js) pour qu'un modérateur/admin puisse les consulter.
--
-- Aucune donnée sensible : message d'erreur, pile d'appels, URL, user-agent,
-- version de l'app. `profile_id` n'est renseigné que si l'utilisateur est
-- déjà connu au moment du plantage (souvent null : erreur possible avant
-- connexion, ou avant que le profil soit chargé).
--
-- ANTI-FLOOD : c'est le CLIENT qui limite (voir errorReporter.js) —
-- déduplication par signature dans la session, plafond ~10 rapports/session,
-- filtrage du bruit connu ("Script error." CORS, "ResizeObserver loop").
-- Pas de contrainte de débit ici : la policy INSERT doit rester ouverte (le
-- but est justement de capter l'erreur même chez un visiteur anonyme), et
-- une limite SQL fiable demanderait un compteur par IP indisponible en RLS.
-- Le garde-fou de volume long terme est la purge > 30 jours (cron plus bas).
-- ============================================================================

create table if not exists client_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  profile_id  uuid references profiles(id) on delete set null,
  -- Bornes de longueur : la policy INSERT est ouverte à "anon" (voir plus
  -- bas), donc un appelant direct malveillant pourrait tenter d'insérer des
  -- charges utiles énormes. Ces bornes plafonnent chaque champ à une taille
  -- largement suffisante pour un vrai rapport d'erreur.
  message     text check (message is null or length(message) <= 2000),
  stack       text check (stack is null or length(stack) <= 8000),
  url         text check (url is null or length(url) <= 2000),
  user_agent  text check (user_agent is null or length(user_agent) <= 500),
  app_version text check (app_version is null or length(app_version) <= 40),
  kind        text check (kind is null or kind in ('error', 'unhandledrejection', 'react'))
);

-- Purge et tri chronologique (consultation "dernières erreurs" + cron ci-dessous).
create index if not exists client_errors_created_at_idx on client_errors (created_at desc);

alter table client_errors enable row level security;

-- INSERT : ouvert à tout le monde (anon + authenticated). C'est le but du
-- rapporteur — capter l'erreur même avant connexion. Pas de donnée sensible ;
-- `profile_id` n'est posé par le client que s'il est déjà connu.
drop policy if exists "client_errors_insert_anyone" on client_errors;
create policy "client_errors_insert_anyone"
  on client_errors for insert
  to anon, authenticated
  with check (true);

-- SELECT : réservé aux modérateurs et au-dessus. Réutilise la fonction
-- existante is_moderator_or_above() (voir supabase-admin.sql).
drop policy if exists "client_errors_select_moderator" on client_errors;
create policy "client_errors_select_moderator"
  on client_errors for select
  to authenticated
  using (is_moderator_or_above());

-- ----------------------------------------------------------------------------
-- Purge automatique > 30 jours — même motif que
-- supabase-cleanup-old-notifications.sql (fonction Postgres pure + pg_cron,
-- aucun accès Storage/API externe nécessaire). Un rapport d'erreur de plus
-- d'un mois n'a plus de valeur actionnable ; empêche la croissance illimitée.
-- ----------------------------------------------------------------------------
create or replace function cleanup_old_client_errors()
returns void language plpgsql as $$
begin
  delete from client_errors where created_at < now() - interval '30 days';
end; $$;

create extension if not exists pg_cron;

select cron.unschedule('baobab-cleanup-old-client-errors')
where exists (select 1 from cron.job where jobname = 'baobab-cleanup-old-client-errors');

select cron.schedule(
  'baobab-cleanup-old-client-errors',
  '45 3 * * *', -- une fois par jour à 3h45 (décalé des autres crons de purge)
  $$ select cleanup_old_client_errors(); $$
);

-- ----------------------------------------------------------------------------
-- Consultation (exécuter séparément, en tant que modérateur/admin) :
--
--   -- 50 dernières erreurs
--   select created_at, kind, message, url, app_version, profile_id
--   from client_errors
--   order by created_at desc
--   limit 50;
--
--   -- regroupées par message sur 7 jours (les plus fréquentes d'abord)
--   select message, count(*) as occurrences,
--          max(created_at) as derniere, count(distinct profile_id) as profils
--   from client_errors
--   where created_at > now() - interval '7 days'
--   group by message
--   order by occurrences desc;
--
-- Vérif du cron :
--   select jobname, schedule, active from cron.job where jobname = 'baobab-cleanup-old-client-errors';
--   select cleanup_old_client_errors(); -- purge manuelle immédiate
-- ============================================================================
