-- ============================================================================
-- SQL-27 — « Supprimer pour tout le monde » : délai vérifié par le serveur, contenu effacé.
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 4 novembre 2026 à partir de la définition RÉELLE de la fonction en production
-- (qui diffère de celle de supabase-messaging-2.sql : textes d'erreur plus courts).
--
-- AVANT : l'auteur pouvait marquer un message « supprimé pour tous » à n'importe quel moment
-- (aucun délai), la date `deleted_at` venait de l'horloge du client, et le texte / la pièce
-- jointe d'origine restaient lisibles par l'API pour l'autre participant (seule l'interface les
-- masquait).
--
-- APRÈS (tout est fait par le déclencheur existant `trg_enforce_message_update_rules`, donc
-- AUCUN appel direct à l'API ne peut le contourner) :
--   1. délai : la suppression pour tous n'est acceptée que pendant N minutes après `created_at`
--      (heure du SERVEUR, now()). N = app_config.message_delete_window_minutes, 15 par défaut ;
--   2. `deleted_at` et `deleted_by` sont posés par le serveur (valeurs envoyées par le client ignorées) ;
--   3. le contenu d'origine est remplacé : texte -> « Ce message a été supprimé. », pièce jointe ->
--      référence neutralisée, métadonnées vidées. Le contenu d'origine n'est plus lisible en base ;
--   4. idempotent : redemander la suppression d'un message déjà supprimé ne change rien (aucune
--      erreur, la date d'origine est conservée) ; annuler une suppression est refusé ;
--   5. seul l'auteur peut supprimer pour tous. « Supprimer pour moi » (deleted_for) est inchangé.
--
-- PARAMÈTRE DU DÉLAI (documentation) :
--   select message_delete_window_minutes from public.app_config;            -- lire (15 par défaut)
--   update public.app_config set message_delete_window_minutes = 30;        -- changer (1 à 10080 = 7 jours)
--   Effet immédiat, sans redéploiement ; le client lit la même valeur pour n'afficher l'option que
--   pendant le délai (le serveur reste l'autorité : une option affichée à tort est refusée).
--
-- LIMITES CONNUES (à lire) :
--   - Le FICHIER d'une photo/vidéo/audio supprimé reste dans le bucket privé `chat-media` : Supabase
--     interdit de supprimer un objet Storage depuis SQL. Le client tente de le retirer par l'API Storage
--     (l'expéditeur y a droit) ; sans cela le fichier devient orphelin (non référencé, bucket privé).
--   - Une suppression ne peut pas être annulée : le contenu d'origine n'est pas conservé.
--   - Les réactions déjà posées sur le message restent (elles ne contiennent pas le contenu).
--
-- DÉPLOIEMENT : 1) pousser le client (il fonctionne avant ce SQL : l'option est simplement
--   limitée à 15 min côté interface) ; 2) exécuter ce fichier ; 3) vérifier (ci-dessous).
--   Les anciennes versions du client déjà chargées continuent de fonctionner (même UPDATE).
--
-- VÉRIFICATIONS APRÈS EXÉCUTION :
--   select message_delete_window_minutes from public.app_config;                       -- 15
--   select prosrc ilike '%est dépassé%' from pg_proc where proname = 'enforce_message_update_rules';  -- true
--   Essai à deux comptes : A écrit, B voit ; A « supprimer pour tout le monde » -> B voit « Ce message a
--   été supprimé. » sans recharger ; après 15 min la même demande est refusée (message « délai dépassé »).
--
-- RETOUR ARRIÈRE (le contenu déjà effacé ne revient PAS) : rejouer la définition d'origine ci-dessous.
--   create or replace function public.enforce_message_update_rules() returns trigger language plpgsql as $f$
--   declare my_profile_id uuid; begin select id into my_profile_id from public.profiles where user_id = auth.uid();
--   if new.text is distinct from old.text or new.media_path is distinct from old.media_path or new.kind is distinct from old.kind
--      or new.from_id is distinct from old.from_id or new.match_key is distinct from old.match_key
--      or new.media_meta is distinct from old.media_meta or new.reply_to_id is distinct from old.reply_to_id
--      or new.created_at is distinct from old.created_at then raise exception 'contenu non modifiable apres envoi'; end if;
--   if (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) and old.from_id <> my_profile_id
--      then raise exception 'seul l auteur peut supprimer pour tous'; end if;
--   if new.deleted_for is distinct from old.deleted_for then
--      if not (old.deleted_for <@ new.deleted_for) or not (new.deleted_for <@ (old.deleted_for || my_profile_id))
--      then raise exception 'deleted_for non autorise'; end if; end if; return new; end; $f$;
--   alter table public.app_config drop constraint if exists app_config_message_delete_window_check;
--   alter table public.app_config drop column if exists message_delete_window_minutes;
-- ============================================================================

alter table public.app_config
  add column if not exists message_delete_window_minutes integer not null default 15;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_config_message_delete_window_check') then
    alter table public.app_config
      add constraint app_config_message_delete_window_check
      check (message_delete_window_minutes between 1 and 10080);
  end if;
end $$;

create or replace function public.enforce_message_update_rules()
returns trigger
language plpgsql
as $$
declare
  my_profile_id uuid;
  v_window integer;
begin
  select id into my_profile_id from public.profiles where user_id = auth.uid();

  -- 1. Le contenu n'est jamais modifiable par le client. (Le remplacement du contenu à la
  --    suppression pour tous est fait plus bas par CE déclencheur, pas par le client.)
  if new.text is distinct from old.text
     or new.media_path is distinct from old.media_path
     or new.kind is distinct from old.kind
     or new.from_id is distinct from old.from_id
     or new.match_key is distinct from old.match_key
     or new.media_meta is distinct from old.media_meta
     or new.reply_to_id is distinct from old.reply_to_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'contenu non modifiable apres envoi';
  end if;

  -- 2. Suppression pour tout le monde.
  if new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
    if old.deleted_at is not null then
      -- Déjà supprimé : on ne revient jamais en arrière ; une nouvelle demande est un no-op idempotent.
      if new.deleted_at is null then
        raise exception 'une suppression ne peut pas etre annulee';
      end if;
      new.deleted_at := old.deleted_at;
      new.deleted_by := old.deleted_by;
    else
      if new.deleted_at is null then
        raise exception 'deleted_by ne se definit qu avec deleted_at';
      end if;

      -- Appel par un compte connecté (pas par le service/SQL) : auteur + délai, heure du SERVEUR.
      if auth.uid() is not null then
        if my_profile_id is null or old.from_id is distinct from my_profile_id then
          raise exception 'seul l auteur peut supprimer pour tous';
        end if;
        select coalesce(min(message_delete_window_minutes), 15) into v_window from public.app_config;
        if now() - old.created_at > make_interval(mins => v_window) then
          raise exception 'Le délai pour supprimer ce message pour tout le monde est dépassé.';
        end if;
        new.deleted_by := my_profile_id;
      end if;
      new.deleted_at := now();

      -- Le contenu d'origine est remplacé (les contraintes de forme de `messages` restent satisfaites).
      new.text := case when old.kind = 'text' then 'Ce message a été supprimé.' else null end;
      new.media_path := case when old.kind in ('image', 'video', 'audio', 'file') then 'deleted' else null end;
      new.media_meta := case old.kind
        when 'sticker' then jsonb_build_object('emoji', '🚫')
        when 'event' then jsonb_build_object('event_id', null)
        else '{}'::jsonb
      end;
    end if;
  end if;

  -- 3. « Supprimer pour moi » : on ne peut qu'ajouter SON PROPRE id (inchangé).
  if new.deleted_for is distinct from old.deleted_for then
    if not (old.deleted_for <@ new.deleted_for)
       or not (new.deleted_for <@ (old.deleted_for || my_profile_id))
    then
      raise exception 'deleted_for non autorise';
    end if;
  end if;

  return new;
end;
$$;
