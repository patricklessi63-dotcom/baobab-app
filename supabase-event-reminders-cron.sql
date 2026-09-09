-- ============================================================================
-- Active enfin la tâche planifiée des rappels d'événements (24h/1h avant).
-- À exécuter dans Supabase : SQL Editor, après supabase-events-v2.sql (et
-- supabase-scale-security.sql si déjà appliqué — les deux définissent
-- send_event_reminders(), le nom de fonction appelé ici ne change pas).
-- ============================================================================
-- INCOHÉRENCE TROUVÉE À L'AUDIT (angle "cohérence des CRON") : send_event_
-- reminders() existe depuis supabase-events-v2.sql avec un commentaire
-- explicite "PAS de tâche planifiée activée automatiquement [...]
-- vérification/activation manuelle laissée à l'utilisateur" — mais
-- contrairement aux deux AUTRES tâches de fond du projet
-- (baobab-process-scheduled-deletions dans supabase-account-deletion.sql,
-- baobab-fetch-immigration-news dans supabase-immigration-news.sql), qui
-- fournissent toutes les deux un bloc "select cron.schedule(...)" prêt à
-- l'emploi, AUCUN fichier du dépôt ne fournissait ce bloc pour les rappels
-- d'événements. Résultat concret : tant que ce fichier n'est pas exécuté,
-- send_event_reminders() n'est appelée par rien — aucun rappel 24h/1h n'est
-- jamais envoyé, silencieusement, malgré une fonction et des colonnes
-- (reminder_24h_sent_at/reminder_1h_sent_at) pleinement fonctionnelles.
--
-- Fréquence choisie — 15 minutes : la fonction ne capture que deux fenêtres
-- étroites (23h-24h avant, et 45-60 min avant). Un cron moins fréquent que
-- ~15 min risquerait de sauter complètement la fenêtre de 15 minutes du
-- rappel "1h avant" pour certains événements.
--
-- Contrairement aux deux autres tâches, pas besoin de net.http_post/vault
-- ici : send_event_reminders() est une fonction Postgres (pas une Edge
-- Function), donc le job peut l'appeler directement en SQL.
-- ============================================================================

create extension if not exists pg_cron;

select cron.unschedule('baobab-send-event-reminders')
where exists (select 1 from cron.job where jobname = 'baobab-send-event-reminders');

select cron.schedule(
  'baobab-send-event-reminders',
  '*/15 * * * *', -- toutes les 15 minutes
  $$ select send_event_reminders(); $$
);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select jobname, schedule, active from cron.job where jobname = 'baobab-send-event-reminders';
-- select jobid, status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'baobab-send-event-reminders')
--   order by start_time desc limit 5;
-- Test manuel immédiat (sans attendre) : select send_event_reminders();
-- ============================================================================
