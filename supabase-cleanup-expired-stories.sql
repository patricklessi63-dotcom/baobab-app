-- ============================================================================
-- Purge réelle des statuts (stories) expirés depuis plus de 7 jours — lignes
-- ET fichiers Storage associés. À exécuter dans Supabase : SQL Editor, après
-- avoir déployé la nouvelle Edge Function cleanup-expired-stories
-- (supabase functions deploy cleanup-expired-stories). Réutilise le secret
-- Vault "service_role_key" déjà créé pour baobab-process-scheduled-deletions
-- (voir supabase-account-deletion.sql) — aucune étape manuelle
-- supplémentaire nécessaire si ce secret existe déjà.
-- ============================================================================
-- POINT LAISSÉ EN SUSPENS À L'AUDIT PRÉCÉDENT, TRANCHÉ ICI : depuis
-- supabase-stories-expiration.sql, un statut expiré (24h) disparaît de
-- l'affichage uniquement via la policy RLS SELECT ("expires_at > now()") —
-- la ligne reste en base et son média orphelin reste dans le bucket
-- "avatars" pour toujours. C'est la SEULE tâche de fond du projet sans cron
-- de purge réelle (comptes en délai de grâce : baobab-process-scheduled-
-- deletions ; actualités immigration : baobab-fetch-immigration-news ;
-- rappels d'événements : baobab-send-event-reminders).
--
-- Politique retenue, alignée sur celle des comptes (délai de grâce avant
-- purge réelle plutôt que suppression immédiate) : purge 7 jours après
-- EXPIRATION (donc 8 jours après publication), pas immédiatement à
-- l'expiration. Ce délai ne profite pas à l'auteur (son statut n'est déjà
-- plus visible par personne dès l'expiration à 24h, RLS oblige) — il sert
-- uniquement de marge de modération : un statut signalé avant son expiration
-- reste consultable par la modération/le support pendant cette semaine
-- plutôt que d'être irrécupérable dès la purge.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('baobab-cleanup-expired-stories')
where exists (select 1 from cron.job where jobname = 'baobab-cleanup-expired-stories');

select cron.schedule(
  'baobab-cleanup-expired-stories',
  '0 3 * * *', -- une fois par jour à 3h (heure serveur, hors heures de pointe)
  $$
  select net.http_post(
    url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/cleanup-expired-stories',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select jobname, schedule, active from cron.job where jobname = 'baobab-cleanup-expired-stories';
-- select jobid, status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'baobab-cleanup-expired-stories')
--   order by start_time desc limit 5;
-- Si le secret Vault "service_role_key" n'existe pas encore (nouvelle
-- instance sans supabase-account-deletion.sql appliqué), le créer d'abord :
--   select vault.create_secret('TA_CLE_SERVICE_ROLE_ICI', 'service_role_key');
-- (clé disponible dans Project Settings > API > service_role — jamais dans
-- le code frontend, jamais dans .env du projet React).
-- ============================================================================
