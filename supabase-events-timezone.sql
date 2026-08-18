-- ============================================================================
-- Fuseau horaire des événements. À exécuter dans Supabase : SQL Editor.
-- Indépendant de supabase-notifications-persistence.sql (ordre arbitraire
-- entre les deux).
-- ============================================================================
-- Corrige un bug identifié à l'audit : event_date est un timestamptz sans
-- fuseau capturé — converti implicitement via le fuseau du navigateur au
-- moment de la création seulement, jamais affiché, dérive possible à
-- l'édition si l'éditeur est dans un fuseau différent.

-- ----------------------------------------------------------------------------
-- 1. Colonne nullable — les événements existants restent null (pas de
-- rétro-devinette trompeuse), l'affichage retombe alors sur le fuseau du
-- lecteur (comportement actuel, inchangé pour eux).
-- ----------------------------------------------------------------------------
alter table events add column if not exists timezone text;

-- ----------------------------------------------------------------------------
-- 2. create_event() — restate complet avec le nouveau paramètre
-- p_timezone (par défaut null, rétrocompatible avec tout appelant existant).
-- ----------------------------------------------------------------------------
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
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'Le titre est requis';
  end if;
  if p_city is null or char_length(trim(p_city)) = 0 then
    raise exception 'La ville est requise';
  end if;
  if p_event_date is null or p_event_date <= now() then
    raise exception 'La date doit etre dans le futur';
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

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns where table_name='events' and column_name='timezone';
-- select proname, pronargs from pg_proc where proname = 'create_event';
-- ============================================================================
