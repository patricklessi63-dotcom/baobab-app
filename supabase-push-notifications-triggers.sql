-- ============================================================================
-- BUG D'AUDIT : les notifications push ne partent JAMAIS. À exécuter dans
-- Supabase : SQL Editor, après supabase-push-notifications.sql et après avoir
-- déployé l'Edge Function send-push (supabase functions deploy send-push)
-- avec ses secrets VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT /
-- PUSH_WEBHOOK_SECRET déjà configurés côté Edge Function.
--
-- Constat : toute la chaîne côté client fonctionne (permission navigateur
-- demandée, abonnement PushManager créé, ligne insérée dans
-- push_subscriptions — voir src/lib/pushNotifications.js) et l'Edge Function
-- send-push (supabase/functions/send-push/index.ts) sait parfaitement générer
-- et envoyer la notification. Mais AUCUN trigger SQL n'appelle jamais cette
-- fonction : ni supabase-notifications-persistence.sql (notify_like/
-- notify_message n'écrivent que dans la table "notifications", jamais
-- d'appel réseau), ni aucun autre fichier du dépôt. Le commentaire en tête
-- de send-push/index.ts ("Déclenché par le trigger pg_net sur messages
-- INSERT... / sur likes INSERT...") décrit un branchement qui n'a en fait
-- jamais été créé en SQL. Résultat concret pour l'utilisateur : il active
-- les notifications push dans les préférences, ça a l'air de marcher (aucune
-- erreur affichée), mais il ne reçoit jamais rien sur son appareil quand
-- l'app est fermée — ni pour un nouveau message, ni pour un nouveau match.
--
-- Correctif : deux triggers pg_net qui appellent send-push, exactement selon
-- le contrat déjà implémenté par l'Edge Function (payload { record: {...} }
-- pour un message, { type: "match", record: { recipient_id, actor_id } }
-- pour un match). L'authentification se fait par le secret partagé
-- x-webhook-secret (PAS le service_role_key déjà utilisé pour le cron de
-- suppression de compte — send-push vérifie explicitement PUSH_WEBHOOK_SECRET,
-- un secret dédié), stocké dans Supabase Vault.
-- ============================================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- 1. Push sur nouveau message — un appel par message inséré, filtré côté
-- Edge Function selon la préférence "messages" et l'aperçu masquable du
-- destinataire (déjà géré par sendToRecipient/hide_message_preview dans
-- send-push/index.ts, rien à dupliquer ici).
-- ----------------------------------------------------------------------------
create or replace function push_notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret')
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end; $$;

drop trigger if exists trg_push_notify_message on messages;
create trigger trg_push_notify_message after insert on messages
for each row execute function push_notify_message();

-- ----------------------------------------------------------------------------
-- 2. Push sur nouveau match — même logique que notify_like() dans
-- supabase-notifications-persistence.sql (un match se forme quand le like
-- inverse existe déjà) : un appel par participant, puisque send-push
-- n'accepte qu'un seul recipient_id par requête.
-- ----------------------------------------------------------------------------
create or replace function push_notify_match()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  if exists (select 1 from likes where from_id = new.to_id and to_id = new.from_id) then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';

    perform net.http_post(
      url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object('type', 'match', 'record', jsonb_build_object('recipient_id', new.from_id, 'actor_id', new.to_id))
    );
    perform net.http_post(
      url := 'https://vozehymbihnckzklxesw.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object('type', 'match', 'record', jsonb_build_object('recipient_id', new.to_id, 'actor_id', new.from_id))
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_push_notify_match on likes;
create trigger trg_push_notify_match after insert on likes
for each row execute function push_notify_match();

-- ----------------------------------------------------------------------------
-- ÉTAPE MANUELLE OBLIGATOIRE (une seule fois, à faire toi-même — je ne dois
-- jamais voir ni écrire ce secret dans un fichier que je génère) :
--
-- Dans Supabase : SQL Editor, exécute séparément AVANT que les triggers
-- ci-dessus ne servent pour de vrai :
--
--   select vault.create_secret('LA_MEME_VALEUR_QUE_PUSH_WEBHOOK_SECRET', 'push_webhook_secret');
--
-- La valeur doit être EXACTEMENT celle déjà configurée comme secret
-- PUSH_WEBHOOK_SECRET de l'Edge Function send-push (Project Settings > Edge
-- Functions > send-push > Secrets, ou "supabase secrets set
-- PUSH_WEBHOOK_SECRET=..." si tu ne l'as pas encore fait). Si les deux ne
-- correspondent pas, send-push répondra 401 et les triggers échoueront
-- silencieusement (net.http_post ne bloque pas l'insertion du message/like,
-- il journalise juste l'échec côté net._http_response).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tgname from pg_trigger where tgname in ('trg_push_notify_message','trg_push_notify_match');
-- select name from vault.decrypted_secrets where name = 'push_webhook_secret';
-- Test manuel : envoie-toi un message depuis un second compte, puis regarde
-- select * from net._http_response order by created desc limit 5;
-- (status_code 200 = l'Edge Function a bien été appelée et a répondu "ok").
-- ============================================================================
