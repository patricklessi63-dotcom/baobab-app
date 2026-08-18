-- ============================================================================
-- Phase 10 (re-audit) — Baobab Scale & Security 🚀 — corrections issues du
-- second passage d'audit (RLS/perf/index), après la Phase 11a. Additif
-- uniquement. À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-scale-security.sql et supabase-follows.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 🔴 CRITIQUE — "messages" n'avait aucune limite de débit côté serveur.
-- Le limiteur client (src/lib/messageRateLimit.js, 8 messages/15s) est
-- explicitement documenté comme un simple confort UX, contournable par un
-- appel direct à l'API PostgREST. Même motif que check_event_invite_rate_limit()
-- (supabase-events-v2.sql) : un vrai garde-fou côté base, généreux pour ne
-- jamais gêner un utilisateur normal (30 messages/minute), mais bloquant un
-- script envoyant en boucle.
-- ----------------------------------------------------------------------------
create or replace function check_message_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from messages
    where from_id = new.from_id and created_at > now() - interval '1 minute';
  if v_count >= 30 then
    raise exception 'Trop de messages envoyes recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_message_rate_limit on messages;
create trigger trg_message_rate_limit before insert on messages
for each row execute function check_message_rate_limit();

-- ----------------------------------------------------------------------------
-- 2. 🟡 "follows" n'avait aucune limite de débit — un compte pouvait suivre
-- massivement des profils (spam de notifications), ou faire des cycles
-- desabonner/reabonner pour re-declencher la notification 'new_follower' de
-- la meme victime en boucle. Meme motif, plafond genereux (100/24h).
-- ----------------------------------------------------------------------------
create or replace function check_follow_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from follows
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 100 then
    raise exception 'Trop d abonnements crees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_follow_rate_limit on follows;
create trigger trg_follow_rate_limit before insert on follows
for each row execute function check_follow_rate_limit();

-- ----------------------------------------------------------------------------
-- 3. 🟡 Index manquants sur les colonnes de filtre les plus fréquentes de
-- toute l'app (conversation ouverte, "mes communautés"/"mes événements" sur
-- quasi tous les écrans, cloche de notifications à chaque session, calcul
-- de match). Sans eux, ces requêtes forcent un balayage complet de la table
-- à mesure que l'app grandit.
-- ----------------------------------------------------------------------------
create index if not exists idx_messages_match_key_created on messages(match_key, created_at desc);
create index if not exists idx_community_members_profile on community_members(profile_id);
create index if not exists idx_notifications_recipient_unread on notifications(recipient_id) where read_at is null;
create index if not exists idx_likes_to_id on likes(to_id);

-- ----------------------------------------------------------------------------
-- 4. 🟡 profiles.user_id n'a jamais eu de contrainte de clé étrangère vers
-- auth.users (dérive de schéma historique, colonne créée avant toute
-- migration versionnée de ce projet — confirmé, aucune raison délibérée de
-- l'avoir omise). Deux bénéfices concrets :
--   a) si un compte auth.users est un jour supprimé autrement que via notre
--      Edge Function delete-account (ex. suppression manuelle depuis le
--      dashboard Supabase), le profil ne reste plus orphelin — il est
--      automatiquement supprimé en cascade, comme prévu partout ailleurs
--      dans ce schéma ;
--   b) ferme la fenêtre où un jeton d'accès encore valide (non expiré) pour
--      un compte tout juste supprimé pourrait recréer un profil "orphelin"
--      via l'INSERT profiles (with check (auth.uid() = user_id)) — impossible
--      une fois la ligne auth.users elle-même absente, la FK rejette l'insert.
--
-- ATTENTION : si cette contrainte échoue, c'est qu'il existe des lignes
-- profiles.user_id sans compte auth.users correspondant (résidu historique) —
-- identifie-les d'abord avec :
--   select p.id, p.user_id from profiles p
--     left join auth.users u on u.id = p.user_id where u.id is null;
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_user_id_fkey') then
    alter table profiles add constraint profiles_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. 🟡 "event_media" UPDATE avait un using() mais pas de with_check — un
-- auteur ou un modérateur pouvait en théorie repointer storage_path vers un
-- chemin arbitraire lors d'une modification (pas d'escalade d'accès réelle
-- puisque la lecture reste filtrée par la visibilité de l'événement, mais un
-- garde-fou manquant par rapport au motif utilisé partout ailleurs).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'event_media' and cmd = 'UPDATE' loop
    execute format('drop policy %I on public.event_media', pol.policyname);
  end loop;

  create policy "L'auteur ou le staff modifie une photo"
  on event_media for update
  using (uploaded_by = current_profile_id() or is_event_mod(event_id))
  with check (uploaded_by = current_profile_id() or is_event_mod(event_id));
end $$;

-- ----------------------------------------------------------------------------
-- 6. 🟠 "messages.text" n'avait aucune limite de longueur, ni côté client
-- (textarea sans maxLength, corrigé dans ConversationPane.jsx) ni côté
-- serveur — un script pouvait insérer un texte de taille arbitraire.
-- ----------------------------------------------------------------------------
alter table messages drop constraint if exists messages_text_length_check;
alter table messages add constraint messages_text_length_check
  check (text is null or char_length(text) <= 4000);

-- ----------------------------------------------------------------------------
-- 7. 🔴 Le bucket "avatars" est réutilisé depuis la Phase 5.5 pour les
-- statuts (stories) — décision déjà documentée à l'époque, pas remise en
-- cause ici. Mais son allowlist MIME (posée en Phase 10,
-- supabase-scale-security.sql) ne contenait que des types image — toute
-- vidéo de statut échouait donc systématiquement à l'upload côté Storage,
-- fonctionnalité cassée de bout en bout. Élargi aux mêmes types vidéo déjà
-- utilisés pour la messagerie riche (src/lib/mediaConstants.js).
-- ----------------------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
where id = 'avatars';

-- ----------------------------------------------------------------------------
-- 8. 🟠 "community_reports.category" n'avait pas de catégorie pour signaler
-- l'usurpation d'identité d'un membre, alors que target_type inclut déjà
-- 'member' — seule catégorie manquante des 3 listes de signalement de l'app.
-- ----------------------------------------------------------------------------
alter table community_reports drop constraint if exists community_reports_category_check;
alter table community_reports add constraint community_reports_category_check
  check (category in ('harcelement','spam','contenu_inapproprie','arnaque','usurpation','autre'));

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname from pg_proc where proname in ('check_message_rate_limit','check_follow_rate_limit');
-- select indexname from pg_indexes where indexname in ('idx_messages_match_key_created','idx_community_members_profile','idx_notifications_recipient_unread','idx_likes_to_id');
-- select conname from pg_constraint where conname = 'profiles_user_id_fkey';
-- select policyname, with_check from pg_policies where tablename = 'event_media' and cmd = 'UPDATE';
-- ============================================================================
