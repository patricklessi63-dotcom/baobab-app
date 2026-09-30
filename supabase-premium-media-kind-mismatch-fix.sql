-- ============================================================================
-- CORRECTIF — le trigger de paywall messagerie ne bloque jamais l'envoi de
-- PHOTOS pour un utilisateur non-Premium, contrairement à l'intention
-- documentée ("l'envoi de photos et vidéos nécessite Baobab Premium").
--
-- TROUVÉ (audit du paywall messagerie, 2026-09-30) : dans
-- enforce_premium_message_limits() (supabase-premium-messaging.sql, fonction
-- créée ligne 46), la condition `if new.kind in ('photo', 'video') then
-- raise exception 'PREMIUM_MEDIA_REQUIRED'` utilise la valeur 'photo', qui
-- ne correspond à AUCUNE valeur réellement envoyée par le client ni
-- acceptée par la contrainte `messages_kind_check` (dernière définition :
-- supabase-events-v2.sql) : les valeurs valides sont
-- 'text','image','video','audio','file','sticker','event' — le client
-- (MessageMediaPicker.jsx, App.jsx sendMediaMessage) envoie toujours
-- `kind: "image"` pour une photo, jamais `kind: "photo"`.
--
-- IMPACT : `new.kind in ('photo', 'video')` ne peut donc jamais matcher
-- 'photo' — un utilisateur gratuit peut envoyer un nombre illimité de
-- PHOTOS même une fois `app_config.monetization_enabled` activé, alors que
-- la vidéo, elle, est bien bloquée (kind='video' matche correctement). La
-- moitié de la restriction Premium sur les médias est donc du code mort,
-- silencieusement inopérant. Actuellement sans impact utilisateur visible
-- car `monetization_enabled = false` en prod (confirmé dans
-- src/lib/premium/premiumConfig.js) — mais ce bug doit être corrigé AVANT
-- toute activation future de la monétisation, sinon le contournement sera
-- immédiat et invisible (aucune erreur, l'envoi de photo réussit
-- simplement).
--
-- CORRECTIF : remplace 'photo' par 'image' dans la condition, seule ligne
-- touchée. Redéfinit la fonction entière (CREATE OR REPLACE, idempotent)
-- pour rester cohérent avec le style des autres correctifs de ce dépôt.
-- Sans risque de régression : un compte Premium (is_premium() déjà vérifié
-- juste avant) n'est jamais affecté, et un compte gratuit qui envoyait déjà
-- des vidéos (kind='video', déjà bloqué) n'est pas non plus affecté — seul
-- l'envoi de photos par un compte gratuit devient enfin bloqué comme prévu.
-- À exécuter dans le SQL Editor de Supabase, après
-- supabase-premium-messaging.sql. Jamais exécuté contre la base de
-- production par cette session.
-- ============================================================================

create or replace function enforce_premium_message_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg app_config;
  v_used int;
begin
  select * into v_cfg from app_config where id = true;
  if v_cfg is null or not v_cfg.monetization_enabled then
    return new;
  end if;
  if is_premium(new.from_id) then
    return new;
  end if;

  if new.kind in ('image', 'video') then
    raise exception 'PREMIUM_MEDIA_REQUIRED: l''envoi de photos et vidéos nécessite Baobab Premium.';
  end if;

  if new.kind = 'text' then
    select count(*) into v_used
    from messages
    where match_key = new.match_key and from_id = new.from_id and kind = 'text';
    if v_used >= v_cfg.free_message_limit then
      raise exception 'FREE_MESSAGE_LIMIT_REACHED: limite de % messages gratuits atteinte pour cette conversation.', v_cfg.free_message_limit;
    end if;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select prosrc from pg_proc where proname = 'enforce_premium_message_limits';
-- → doit contenir "'image', 'video'", plus jamais "'photo'".
-- ============================================================================
