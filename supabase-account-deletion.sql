-- ============================================================================
-- Suppression de compte avec délai de grâce de 7 jours. À exécuter dans
-- Supabase : SQL Editor, après avoir déployé la nouvelle Edge Function
-- process-scheduled-deletions (supabase functions deploy process-scheduled-deletions)
-- ET après avoir stocké ta clé service role dans Supabase Vault (étape
-- manuelle décrite en bas de ce fichier — à faire AVANT d'exécuter le bloc
-- "select cron.schedule(...)" plus bas, sinon la tâche planifiée échouera).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne de statut — un profil "en attente de suppression" reste
-- pleinement fonctionnel (pas de restriction d'accès pendant les 7 jours),
-- seule la bannière côté client change son comportement.
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists deletion_requested_at timestamptz;

-- Aucune nouvelle policy RLS nécessaire : la policy UPDATE existante sur
-- profiles (voir supabase-scale-security.sql) autorise déjà un utilisateur
-- à modifier sa propre ligne, ce qui couvre l'écriture de cette colonne.

-- ----------------------------------------------------------------------------
-- 2. pg_cron + pg_net — tâche planifiée toutes les heures, traite les
-- comptes en délai de grâce dépassé (voir process-scheduled-deletions).
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('baobab-process-scheduled-deletions')
where exists (select 1 from cron.job where jobname = 'baobab-process-scheduled-deletions');

select cron.schedule(
  'baobab-process-scheduled-deletions',
  '0 * * * *', -- toutes les heures, à l'heure pile
  $$
  select net.http_post(
    url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/process-scheduled-deletions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- ----------------------------------------------------------------------------
-- ÉTAPE MANUELLE OBLIGATOIRE (une seule fois, à faire toi-même — je ne dois
-- jamais voir ni écrire ta clé service role dans un fichier que je génère) :
--
-- Dans Supabase : SQL Editor, exécute séparément (AVANT le bloc cron.schedule
-- ci-dessus, ou reschedule après si tu l'as déjà lancé) :
--
--   select vault.create_secret('TA_CLE_SERVICE_ROLE_ICI', 'service_role_key');
--
-- Ta clé service role se trouve dans : Project Settings > API > service_role
-- (jamais dans le code frontend, jamais dans .env du projet React — ce
-- secret ne doit exister que dans Vault et dans les variables d'environnement
-- des Edge Functions, où il est déjà disponible automatiquement).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select jobname, schedule, active from cron.job where jobname = 'baobab-process-scheduled-deletions';
-- select name from vault.decrypted_secrets where name = 'service_role_key';
-- Test manuel sans attendre 7 jours (marque TON PROPRE compte de test en
-- retard, à annuler ensuite si besoin) :
--   update profiles set deletion_requested_at = now() - interval '8 days' where id = 'ID_DE_TEST';
--   -- puis force un appel immédiat de la tâche : select cron.schedule('baobab-test-run', 'now', $$ select net.http_post(url := '...', headers := ...); $$);
-- ============================================================================
