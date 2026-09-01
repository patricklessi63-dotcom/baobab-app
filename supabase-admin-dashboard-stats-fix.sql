-- ============================================================================
-- CORRECTIF — conflit de migrations non fusionnées sur admin_dashboard_stats()
-- (trouvé lors de l'audit autonome du 1er septembre 2026, passage 59,
-- section AdminDashboard.jsx).
--
-- Quatre fichiers redéfinissent admin_dashboard_stats() via
-- "create or replace function" au fil des sessions :
--   1. supabase-admin.sql (base) : total_users/suspended_users/banned_users/
--      open_reports(4 sources)/pending_info_review.
--   2. supabase-premium-messaging.sql : ajoute "monetization".
--   3. supabase-profile-reports-moderation.sql : ajoute les signalements de
--      profil (table "reports") à open_reports, et FUSIONNE bien
--      "monetization" (voir son propre commentaire — c'était déjà un
--      correctif d'un conflit précédent, commit 8e0778c).
--   4. supabase-beta-feedback-admin.sql (exécuté le plus récemment) : ajoute
--      "open_feedback"/"critical_feedback", mais est reparti de la version
--      DE BASE (1) — sans "monetization" et sans les signalements de profil
--      dans open_reports. Son "create or replace" écrase donc silencieusement
--      les deux : le champ "monetization" disparaît du JSON, et le compteur
--      "Signalements ouverts" du dashboard admin sous-compte en excluant les
--      signalements de profil (rencontre/messagerie — la catégorie la plus
--      sensible : harcèlement, arnaque entre deux personnes mises en
--      relation), alors que l'onglet "Signalements" (admin_list_reports, lui
--      non touché par ce fichier) les affiche bien. Incohérence visible :
--      des signalements de profil ouverts apparaissent dans la liste mais ne
--      sont pas comptés dans la carte de stats "Signalements ouverts".
--
-- Ce fichier fusionne les quatre pour de bon. Idempotent (create or
-- replace) — à exécuter une fois dans Supabase SQL Editor, après les
-- quatre fichiers ci-dessus.
-- ============================================================================

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
      (select count(*) from info_reports where status = 'open') +
      (select count(*) from reports where status = 'open')
    ),
    'pending_info_review', (select count(*) from info_articles where status = 'pending_review'),
    'monetization', (select jsonb_build_object(
      'enabled', monetization_enabled,
      'threshold', premium_threshold,
      'free_message_limit', free_message_limit
    ) from app_config),
    'open_feedback', (select count(*) from beta_feedback where status not in ('resolu','ferme')),
    'critical_feedback', (select count(*) from beta_feedback where priority = 'critique' and status not in ('resolu','ferme'))
  ) into v_result;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select admin_dashboard_stats(); -- doit contenir monetization + open_feedback + critical_feedback,
--                                 -- et open_reports doit inclure les signalements de profil.
-- ============================================================================
