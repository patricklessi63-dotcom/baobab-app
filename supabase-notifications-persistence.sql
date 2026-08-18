-- ============================================================================
-- Notifications like/match/message persistées + colonne préférences. À
-- exécuter dans Supabase : SQL Editor, après supabase-feed-posts.sql
-- (fournit la dernière version de notifications_type_check à réécrire).
-- ============================================================================
-- Corrige un bug identifié à l'audit : aucune notification n'existait pour
-- "quelqu'un a aimé ton profil" (aucun code, ni éphémère ni persisté), et
-- les messages utilisaient un système 100% éphémère côté client (perdu au
-- rechargement) — contrairement à abonnement/communauté/événement/
-- publication déjà persistés. Calqué exactement sur notify_new_follower()
-- (supabase-follows.sql).

-- ----------------------------------------------------------------------------
-- 1. Nouveaux types — restate complet (motif déjà utilisé 4 fois).
-- ----------------------------------------------------------------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'join_request_received','join_request_accepted','invite_received','report_received',
  'event_invite','event_participation_confirmed','event_updated','event_cancelled',
  'event_reminder_24h','event_reminder_1h','event_report_received','event_waitlist_promoted',
  'premium_activated','premium_payment_failed','premium_cancelled','premium_renewing_soon',
  'new_follower','post_liked','post_commented','new_like','new_match','new_message'
));

-- ----------------------------------------------------------------------------
-- 2. notify_like() — notifie le like, et si l'autre avait déjà liké en
-- retour, notifie aussi les DEUX participants du match (celui qui complète
-- le match voit déjà la modale de célébration en temps réel côté client,
-- comportement inchangé — cette notification lui reste utile plus tard
-- dans son historique).
-- ----------------------------------------------------------------------------
create or replace function notify_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, actor_id, type, target_type, target_id)
  values (new.to_id, new.from_id, 'new_like', 'profile', new.from_id);

  if exists (select 1 from likes where from_id = new.to_id and to_id = new.from_id) then
    insert into notifications (recipient_id, actor_id, type, target_type, target_id)
    values
      (new.from_id, new.to_id, 'new_match', 'profile', new.to_id),
      (new.to_id, new.from_id, 'new_match', 'profile', new.from_id);
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_like on likes;
create trigger trg_notify_like after insert on likes
for each row execute function notify_like();

-- ----------------------------------------------------------------------------
-- 3. notify_message() — pas de colonne to_id sur "messages" (seulement
-- match_key, format "idA__idB" triés). Destinataire = l'autre moitié du
-- match_key (même décomposition déjà utilisée dans les policies RLS de
-- supabase-messaging.sql).
-- ----------------------------------------------------------------------------
create or replace function notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recipient_id uuid;
begin
  select t::uuid into v_recipient_id
  from unnest(string_to_array(new.match_key, '__')) as t
  where t <> new.from_id::text
  limit 1;

  if v_recipient_id is not null then
    insert into notifications (recipient_id, actor_id, type, target_type, target_id)
    values (v_recipient_id, new.from_id, 'new_message', 'profile', new.from_id);
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_message on messages;
create trigger trg_notify_message after insert on messages
for each row execute function notify_message();

-- ----------------------------------------------------------------------------
-- 4. Préférences de notifications — objet vide = tout activé par défaut
-- (modèle opt-out, aucun backfill nécessaire, une clé absente = activée).
-- Décision de périmètre : filtrage appliqué côté client à l'affichage
-- (SocialShell.jsx), pas de suppression à la source dans les triggers
-- communautaires/événements déjà existants — voir rapport final.
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select conname from pg_constraint where conname = 'notifications_type_check';
-- select tgname from pg_trigger where tgname in ('trg_notify_like','trg_notify_message');
-- select column_name from information_schema.columns where table_name='profiles' and column_name='notification_preferences';
-- ============================================================================
