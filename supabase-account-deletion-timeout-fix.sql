-- ============================================================================
-- BUG D'AUDIT (trouvé en vérifiant net._http_response après la mise en place
-- des triggers push ce soir) : la tâche planifiée "baobab-process-scheduled-
-- deletions" (supabase-account-deletion.sql, toutes les heures pile) échoue
-- systématiquement par timeout — TOUTES les tentatives observées (00h, 01h,
-- 02h, 03h UTC) ont atteint le délai de 5 secondes sans réponse. Concrètement :
-- une suppression de compte différée programmée par un utilisateur ne
-- s'exécute jamais tant que ce timeout persiste.
--
-- Ce fichier ne corrige que le symptôme visible côté base (délai trop court
-- pour une fonction qui fait plusieurs appels Storage + Stripe en série par
-- compte traité) — PAS la cause racine, que je ne peux pas voir sans accès
-- aux logs d'exécution de la fonction Edge. Après avoir exécuté ce fichier,
-- vérifie dans Supabase : Edge Functions > process-scheduled-deletions > Logs
-- s'il y a une erreur récurrente (clé Stripe manquante/invalide, erreur
-- Storage, etc.) — si le timeout se reproduit même à 30s, le problème est
-- ailleurs qu'un simple délai trop court.
--
-- À exécuter dans Supabase : SQL Editor, après supabase-account-deletion.sql
-- (déjà exécuté — ce fichier ne fait que reprogrammer le même job avec un
-- délai plus long, rien d'autre ne change).
-- ============================================================================

select cron.unschedule('baobab-process-scheduled-deletions')
where exists (select 1 from cron.job where jobname = 'baobab-process-scheduled-deletions');

select cron.schedule(
  'baobab-process-scheduled-deletions',
  '0 * * * *', -- toutes les heures, à l'heure pile (inchangé)
  $$
  select net.http_post(
    url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/process-scheduled-deletions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000 -- 30s au lieu des 5s par défaut de pg_net
  );
  $$
);

-- ----------------------------------------------------------------------------
-- Vérification (à exécuter séparément, après la prochaine heure pile) :
-- select id, status_code, timed_out, error_msg, created from net._http_response
--   order by created desc limit 5;
-- -- status_code = 200 et timed_out = false : la fonction a répondu à temps.
-- -- timed_out = true encore une fois même à 30s : le problème n'est pas le
-- -- délai, va voir les logs d'exécution de la fonction (voir note ci-dessus).
-- ============================================================================
