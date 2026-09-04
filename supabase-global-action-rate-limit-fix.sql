-- ============================================================================
-- Limite de débit GLOBALE, transversale à toutes les actions dirigées vers
-- un·e autre membre (messages / likes / follows / reports / invitations
-- d'événement) — trouvé à l'audit (angle "rate limit global").
--
-- CONSTAT : chaque action a déjà sa propre limite serveur indépendante
-- (supabase-scale-security-2.sql : messages 30/min, follows 100/24h ;
-- supabase-like-rate-limit.sql : likes 150/24h ; supabase-report-rate-
-- limit-fix.sql : reports 20/24h ; supabase-events-v2.sql : invitations
-- 30/24h). Chacune compte UNIQUEMENT sa propre table sur sa propre
-- fenêtre. Un script qui enchaîne rapidement des actions DIFFÉRENTES en
-- boucle (un like, puis un message, puis un follow, puis un like, sur des
-- cibles différentes) ne fait jamais monter un seul compteur assez vite
-- pour déclencher SA limite individuelle, alors que le débit combiné sur
-- le compte est anormalement élevé — exactement le signal de comportement
-- de bot qu'aucune limite par-action ne capture isolément.
--
-- CORRECTIF : une fonction utilitaire additionne, sur une fenêtre courte
-- (60 secondes), le nombre d'insertions récentes du même profil dans les
-- cinq tables ci-dessus, et chacun des cinq triggers "check_*_rate_limit"
-- existants l'appelle en plus de son propre compteur. Plafond généreux
-- (40 actions/60s toutes tables confondues) : un usage normal, même une
-- personne qui tape des messages très vite dans une conversation, n'a
-- aucune raison d'approcher ce total en combinant plusieurs TYPES d'action
-- différents sur une seule minute ; seul un script en boucle peut
-- l'atteindre en alternant les types pour rester sous chaque limite
-- individuelle. Ne remplace aucune des limites par-action existantes,
-- s'ajoute strictement par-dessus.
--
-- Additif uniquement, idempotent (create or replace + drop/create trigger).
-- À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-scale-security-2.sql, supabase-like-rate-limit.sql,
-- supabase-report-rate-limit-fix.sql et supabase-events-v2.sql (les
-- fonctions qu'il patche doivent déjà exister).
-- ============================================================================

create or replace function global_recent_action_count(p_profile_id uuid)
returns int language sql security definer set search_path = public stable as $$
  select
    (select count(*) from messages where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from likes where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from follows where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from reports where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from event_invitations where invited_by = p_profile_id and created_at > now() - interval '60 seconds');
$$;

create or replace function check_message_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from messages
    where from_id = new.from_id and created_at > now() - interval '1 minute';
  if v_count >= 30 then
    raise exception 'Trop de messages envoyes recemment, reessaie dans un instant';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_message_rate_limit on messages;
create trigger trg_message_rate_limit before insert on messages
for each row execute function check_message_rate_limit();

create or replace function check_follow_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from follows
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 100 then
    raise exception 'Trop d abonnements crees recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_follow_rate_limit on follows;
create trigger trg_follow_rate_limit before insert on follows
for each row execute function check_follow_rate_limit();

create or replace function check_like_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from likes
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 150 then
    raise exception 'Trop de mises en relation initiees recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_like_rate_limit on likes;
create trigger trg_like_rate_limit before insert on likes
for each row execute function check_like_rate_limit();

create or replace function check_report_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from reports
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 20 then
    raise exception 'Trop de signalements envoyes recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_report_rate_limit on reports;
create trigger trg_report_rate_limit before insert on reports
for each row execute function check_report_rate_limit();

create or replace function check_event_invite_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from event_invitations
    where invited_by = new.invited_by and created_at > now() - interval '24 hours';
  if v_count >= 30 then
    raise exception 'Trop d invitations envoyees recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.invited_by) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_event_invite_rate_limit on event_invitations;
create trigger trg_event_invite_rate_limit before insert on event_invitations
for each row execute function check_event_invite_rate_limit();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname from pg_proc where proname in
--   ('global_recent_action_count','check_message_rate_limit',
--    'check_follow_rate_limit','check_like_rate_limit',
--    'check_report_rate_limit','check_event_invite_rate_limit');
-- ============================================================================
