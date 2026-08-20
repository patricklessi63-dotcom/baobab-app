-- ============================================================================
-- Phase — Baobab Rencontres & Matching 2.0 — à exécuter dans Supabase :
-- SQL Editor (une fois).
-- ============================================================================
-- AUDIT PRÉALABLE (résumé, voir rapport final pour le détail complet) :
-- le like/pass/match/unlike/block/report/notifications de match sont déjà
-- réels et fonctionnels (supabase-matching.sql, supabase-unlike.sql,
-- supabase-notifications-persistence.sql). Ce fichier n'ajoute QUE les
-- vraies lacunes confirmées par l'audit : activation volontaire des
-- Rencontres, "supprimer le match" (jamais construit — noté explicitement
-- hors-périmètre dans supabase-unlike.sql), réorganisation des photos, et
-- un signal (non bloquant) de vérification humaine sur les signalements
-- répétés. Aucune table existante n'est recréée ni modifiée dans sa
-- structure de façon destructive.

-- ----------------------------------------------------------------------------
-- 1. Activation volontaire des Rencontres (section 2 du cahier des charges).
-- Défaut = true : préserve le comportement actuel (tous les profils déjà
-- inscrits restent visibles en Découverte tant qu'ils n'ont pas
-- explicitement désactivé) — désactiver est un choix, pas une régression
-- silencieuse pour les utilisateurs existants.
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists dating_enabled boolean not null default true;

-- ----------------------------------------------------------------------------
-- 2. Réorganisation des photos (section 4) — la table profile_photos existe
-- déjà en production (lecture/insertion/suppression fonctionnent) mais
-- n'avait jamais eu de policy UPDATE tracée, nécessaire pour persister un
-- nouvel ordre ("position") ou changer la photo principale. Ajout sûr et
-- idempotent, sans toucher aux policies déjà en place.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profile_photos' and cmd = 'UPDATE' loop
    execute format('drop policy %I on public.profile_photos', pol.policyname);
  end loop;

  create policy "Un utilisateur reordonne ses propres photos"
  on profile_photos for update
  using (auth.uid() = (select user_id from profiles where id = profile_photos.profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_photos.profile_id));
end $$;

-- ----------------------------------------------------------------------------
-- 3. "Supprimer le match" / unmatch (section 14) — périmètre volontairement
-- non couvert par supabase-unlike.sql (voir son commentaire : "défaire un
-- match complet est un chantier à part"). Il n'existe pas de table "matches"
-- dédiée : un match est purement dérivé de deux lignes "likes" mutuelles
-- (App.jsx: getMatches()). Un utilisateur ne peut supprimer QUE son propre
-- like (RLS existante) — il ne peut pas supprimer la ligne "likes" de
-- l'autre personne directement. Cette fonction RPC security definer fait
-- donc les deux suppressions de façon atomique, après avoir vérifié
-- elle-même que l'appelant est bien authentifié et qu'un match réciproque
-- existe réellement (jamais de confiance dans un paramètre côté client).
--
-- Après un unmatch, les deux profils sont aussi insérés mutuellement dans
-- "passes" (table déjà existante, déjà filtrée en Découverte) pour éviter
-- qu'ils ne se re-proposent immédiatement l'un à l'autre — comportement
-- standard des apps de rencontre. L'historique des messages n'est PAS
-- supprimé (la policy SELECT sur "messages" ne dépend que de l'appartenance
-- au match_key, jamais de l'existence actuelle du match : cf. règle 36 du
-- cahier des charges, "respecter les règles existantes concernant la
-- conversation") ; seul l'envoi de NOUVEAUX messages redevient impossible,
-- car la policy INSERT sur "messages" (supabase-audit-fixes.sql) exige un
-- like mutuel encore présent.
-- ----------------------------------------------------------------------------
create or replace function unmatch_profile(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
begin
  select id into me from profiles where user_id = auth.uid();
  if me is null then
    raise exception 'Non authentifié';
  end if;
  if me = target_id then
    raise exception 'Cible invalide';
  end if;
  if not exists (select 1 from likes where from_id = me and to_id = target_id)
     or not exists (select 1 from likes where from_id = target_id and to_id = me) then
    raise exception 'Aucun match actif avec ce profil';
  end if;

  delete from likes where from_id = me and to_id = target_id;
  delete from likes where from_id = target_id and to_id = me;

  insert into passes (from_id, to_id) values (me, target_id) on conflict (from_id, to_id) do nothing;
  insert into passes (from_id, to_id) values (target_id, me) on conflict (from_id, to_id) do nothing;
end;
$$;

revoke all on function unmatch_profile(uuid) from public;
grant execute on function unmatch_profile(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Anti-arnaque — signal de vérification humaine, jamais de décision
-- automatique (section 17 : "une décision importante doit pouvoir être
-- examinée par un humain"). On se contente de compter les signalements
-- reçus et de poser un drapeau visible en base après un seuil — aucune
-- suspension ni masquage automatique du profil : il n'existe pas encore de
-- tableau de bord de modération dans Baobab pour agir dessus, ce drapeau
-- est donc préparé pour un futur écran d'administration (noté explicitement
-- dans le rapport final comme périmètre restant).
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists report_count integer not null default 0;
alter table profiles add column if not exists flagged_for_review boolean not null default false;

create or replace function flag_profile_on_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set report_count = report_count + 1,
      flagged_for_review = (report_count + 1) >= 3
  where id = new.to_id;
  return new;
end;
$$;

drop trigger if exists trg_flag_profile_on_reports on reports;
create trigger trg_flag_profile_on_reports after insert on reports
for each row execute function flag_profile_on_reports();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns where table_name='profiles'
--   and column_name in ('dating_enabled','report_count','flagged_for_review');
-- select policyname, cmd from pg_policies where tablename='profile_photos';
-- select proname from pg_proc where proname in ('unmatch_profile','flag_profile_on_reports');
-- select tgname from pg_trigger where tgname = 'trg_flag_profile_on_reports';
-- ============================================================================
