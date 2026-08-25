-- ============================================================================
-- "Un souci ? Une idée ?" — suivi admin des retours (beta_feedback)
-- Additif à supabase-beta-tracking.sql et supabase-beta-feedback-category.sql
-- (déjà exécutés). Prérequis : supabase-admin.sql (is_moderator_or_above,
-- current_profile_id). À exécuter une fois dans Supabase SQL Editor.
--
-- Aujourd'hui, beta_feedback n'a AUCUNE policy SELECT : seule la personne qui
-- écrit un retour peut l'insérer, personne ne peut le relire depuis l'appli
-- (le seul accès existant est la console SQL, avec le rôle postgres qui
-- contourne RLS). Ce fichier ajoute : le suivi de statut/priorité/catégories
-- multiples/contexte technique déjà envoyé par le client (voir
-- src/lib/feedbackTriage.js), une lecture réservée aux modérateurs+ via RPC
-- (jamais un accès table direct), et une mise à jour de statut réservée aux
-- mêmes rôles. Suit le même patron que le reste de supabase-admin.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonnes de suivi (toutes additives, valeurs par défaut sûres pour les
-- lignes déjà existantes).
-- ----------------------------------------------------------------------------
alter table beta_feedback add column if not exists status text not null default 'nouveau'
  check (status in ('nouveau','analyse_en_cours','probleme_identifie','correction_en_cours','corrige','tests_en_cours','resolu','intervention_humaine','ferme'));
alter table beta_feedback add column if not exists priority text not null default 'moyenne'
  check (priority in ('critique','elevee','moyenne','faible'));
alter table beta_feedback add column if not exists categories text[] not null default '{}';
alter table beta_feedback add column if not exists device text;
alter table beta_feedback add column if not exists browser text;
alter table beta_feedback add column if not exists app_version text;
alter table beta_feedback add column if not exists admin_notes text;
alter table beta_feedback add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_beta_feedback_status on beta_feedback(status);

-- ----------------------------------------------------------------------------
-- 2. RPC — liste des retours (moderator+ uniquement). Pas de policy SELECT
-- cliente directe : tout passe par cette fonction, comme admin_list_reports.
-- ----------------------------------------------------------------------------
create or replace function admin_list_feedback(p_status text default null)
returns table (
  id uuid, profile_id uuid, author_name text, message text, category text,
  categories text[], priority text, status text, screen text, device text,
  browser text, app_version text, admin_notes text, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select bf.id, bf.profile_id, p.name, bf.message, bf.category, bf.categories,
           bf.priority, bf.status, bf.screen, bf.device, bf.browser, bf.app_version,
           bf.admin_notes, bf.created_at, bf.updated_at
    from beta_feedback bf
    join profiles p on p.id = bf.profile_id
    where p_status is null or bf.status = p_status
    order by
      case bf.priority when 'critique' then 0 when 'elevee' then 1 when 'moyenne' then 2 else 3 end,
      bf.created_at desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPC — mise à jour du statut/priorité/notes d'un ticket (moderator+).
-- ----------------------------------------------------------------------------
create or replace function admin_update_feedback(p_id uuid, p_status text default null, p_priority text default null, p_admin_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  update beta_feedback set
    status = coalesce(p_status, status),
    priority = coalesce(p_priority, priority),
    admin_notes = coalesce(p_admin_notes, admin_notes),
    updated_at = now()
  where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Étend admin_dashboard_stats() avec le nombre de retours non fermés —
-- redéfinition complète (CREATE OR REPLACE) pour ne pas perdre les champs
-- existants (voir supabase-admin.sql, section 7).
-- ----------------------------------------------------------------------------
create or replace function admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  select jsonb_build_object(
    'total_users', (select count(*) from profiles),
    'suspended_users', (select count(*) from profiles where suspended_until is not null and suspended_until > now()),
    'banned_users', (select count(*) from profiles where banned_at is not null),
    'open_reports', (
      (select count(*) from community_reports where status = 'open') +
      (select count(*) from event_reports where status = 'open') +
      (select count(*) from post_reports where coalesce(status,'open') = 'open') +
      (select count(*) from info_reports where status = 'open')
    ),
    'pending_info_review', (select count(*) from info_articles where status = 'pending_review'),
    'open_feedback', (select count(*) from beta_feedback where status not in ('resolu','ferme')),
    'critical_feedback', (select count(*) from beta_feedback where priority = 'critique' and status not in ('resolu','ferme'))
  ) into v_result;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select id, status, priority, categories, device, browser, created_at from beta_feedback order by created_at desc limit 10;
-- select * from admin_dashboard_stats();
-- ============================================================================
