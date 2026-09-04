-- ============================================================================
-- Corrige un défaut relevé à l'audit (passage suivant le correctif CRITIQUE
-- NULL-bypass) : create_community() et create_event() sont les deux SEULES
-- fonctions "create_xxx" du schéma à n'avoir AUCUNE vérification d'auth
-- explicite en tête de fonction (toutes les autres, ex. create_info_article,
-- appellent un garde type is_xxx() en premier). Elles valident bien les
-- champs métier (titre, ville, date...) mais pas l'identité de l'appelant.
--
-- Ce n'était PAS le bug NULL-bypass déjà corrigé (aucune garde
-- "X() in (...)" ici à contourner) : un appel anonyme (current_profile_id()
-- = null, aucun profil) atteignait quand même l'INSERT, qui échouait
-- seulement PAR ACCIDENT sur une contrainte "not null" en aval :
--   - create_community() : communities.created_by est nullable (on delete
--     set null), donc le premier insert réussit ; c'est le second insert,
--     "insert into community_members (..., profile_id, ...)" avec
--     profile_id not null references profiles(id), qui échoue en dernier
--     avec une erreur Postgres brute ("null value in column profile_id
--     violates not-null constraint") — un détail d'implémentation exposé
--     tel quel au client au lieu d'un message propre.
--   - create_event() : même mécanisme via event_staff.profile_id /
--     event_attendees.profile_id (tous deux not null).
--
-- Rien d'exploitable ici (l'appel finissait de toute façon par échouer,
-- aucune ligne orpheline créée grâce aux FK not null), mais le message
-- d'erreur brut fuite un détail de schéma. Correctif : rejet explicite et
-- propre en tête de fonction, comme le fait déjà create_info_article() avec
-- is_info_editor(). Audit complémentaire : aucune autre fonction "create_xxx"
-- du schéma n'a ce défaut (toutes les autres ont déjà une garde explicite).
--
-- Restate complet des dernières versions en date :
--   - create_community() : signature avec p_rules (supabase-communities-2.sql,
--     la plus récente).
--   - create_event() : signature avec p_timezone + garde durée
--     (supabase-events-duration-guard.sql, la plus récente).
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste — mais APRÈS supabase-communities-2.sql et
-- supabase-events-duration-guard.sql s'ils ne sont pas encore appliqués,
-- puisque ce fichier restate les mêmes signatures).
-- ============================================================================

create or replace function create_community(
  p_name text, p_description text, p_category text, p_city text, p_visibility text, p_cover_url text, p_rules text default null
)
returns communities
language plpgsql security definer set search_path = public
as $$
declare v_community communities;
begin
  if current_profile_id() is null then
    raise exception 'Non authentifie';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Le nom est requis';
  end if;
  insert into communities (name, description, category, city, visibility, cover_url, rules, created_by)
  values (trim(p_name), p_description, p_category, p_city, coalesce(p_visibility, 'public'), p_cover_url, p_rules, current_profile_id())
  returning * into v_community;

  insert into community_members (community_id, profile_id, role)
  values (v_community.id, current_profile_id(), 'owner');

  return v_community;
end;
$$;

create or replace function create_event(
  p_title text, p_description text, p_category text, p_cover_url text,
  p_event_date timestamptz, p_duration_minutes integer,
  p_city text, p_location text, p_max_participants integer,
  p_visibility text, p_community_id uuid, p_timezone text default null
)
returns events
language plpgsql security definer set search_path = public
as $$
declare v_event events;
begin
  if current_profile_id() is null then
    raise exception 'Non authentifie';
  end if;
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'Le titre est requis';
  end if;
  if p_city is null or char_length(trim(p_city)) = 0 then
    raise exception 'La ville est requise';
  end if;
  if p_event_date is null or p_event_date <= now() then
    raise exception 'La date doit etre dans le futur';
  end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'La duree doit etre un nombre de minutes positif';
  end if;
  if p_max_participants is not null and p_max_participants <= 0 then
    raise exception 'Le nombre maximum de participants doit etre positif';
  end if;
  if coalesce(p_visibility, 'public') = 'community' and p_community_id is null then
    raise exception 'Une communaute est requise pour un evenement communautaire';
  end if;
  if p_community_id is not null and not is_community_member(p_community_id) then
    raise exception 'Tu dois etre membre de cette communaute';
  end if;

  insert into events (
    title, description, category, cover_url, event_date, duration_minutes,
    city, location, max_participants, visibility, community_id, created_by, timezone
  )
  values (
    trim(p_title), p_description, p_category, p_cover_url, p_event_date, p_duration_minutes,
    trim(p_city), nullif(trim(coalesce(p_location, '')), ''), p_max_participants,
    coalesce(p_visibility, 'public'), p_community_id, current_profile_id(), p_timezone
  )
  returning * into v_event;

  insert into event_staff (event_id, profile_id, role) values (v_event.id, current_profile_id(), 'organizer');
  insert into event_attendees (event_id, profile_id, status) values (v_event.id, current_profile_id(), 'going');

  return v_event;
end;
$$;
