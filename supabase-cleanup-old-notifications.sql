-- ============================================================================
-- Purge des notifications trop anciennes (90 jours). À exécuter dans
-- Supabase : SQL Editor, après supabase-notifications-persistence.sql.
-- ============================================================================
-- TROUVÉ EN CHERCHANT D'AUTRES DONNÉES SANS NETTOYAGE DE FOND (même audit
-- que supabase-cleanup-expired-stories.sql) : la table "notifications"
-- (supabase-communities.sql, étendue par supabase-notifications-persistence.sql
-- à new_like/new_match/new_message — donc une notification par like ET par
-- message envoyé sur toute la plateforme) n'a JAMAIS eu de policy de
-- masquage ni de cron de purge. Contrairement aux statuts (masqués par RLS
-- dès l'expiration), une notification vieille de plusieurs années reste
-- pour toujours visible dans la liste de l'utilisateur (SocialShell.jsx ne
-- fait que marquer "lu", jamais supprimer — voir handleNotificationClick /
-- handleMarkAllRead). Sur une table qui reçoit une ligne par like et par
-- message, c'est la plus mauvaise candidate à une croissance illimitée sans
-- purge de tout le projet.
--
-- Vérifié avant de choisir cette politique : la table n'est PAS utilisée
-- comme journal d'audit (contrairement à admin_actions, volontairement
-- permanent — voir supabase-admin.sql) ni comme source d'un rapport
-- historique (supabase-beta-dashboard.sql ne l'interroge jamais). Sa seule
-- fonction est l'affichage "Notifications" de l'utilisateur courant : une
-- notification de plusieurs mois n'a plus de valeur actionnable. Purge
-- inconditionnelle (lue ou non) après 90 jours plutôt qu'un masquage RLS
-- (contrairement aux statuts, il n'existe ici aucune raison de conserver la
-- ligne au-delà : pas de fenêtre de modération à couvrir, pas de fichier
-- Storage associé à synchroniser).
--
-- Fonction Postgres pure (comme send_event_reminders()) plutôt qu'une Edge
-- Function : aucun accès Storage/API externe nécessaire ici.
-- ============================================================================

create or replace function cleanup_old_notifications()
returns void language plpgsql as $$
begin
  delete from notifications where created_at < now() - interval '90 days';
end; $$;

create extension if not exists pg_cron;

select cron.unschedule('baobab-cleanup-old-notifications')
where exists (select 1 from cron.job where jobname = 'baobab-cleanup-old-notifications');

select cron.schedule(
  'baobab-cleanup-old-notifications',
  '30 3 * * *', -- une fois par jour à 3h30 (décalé du cron des statuts à 3h)
  $$ select cleanup_old_notifications(); $$
);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select jobname, schedule, active from cron.job where jobname = 'baobab-cleanup-old-notifications';
-- select jobid, status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'baobab-cleanup-old-notifications')
--   order by start_time desc limit 5;
-- Test manuel immédiat (sans attendre) : select cleanup_old_notifications();
-- ============================================================================
