-- ============================================================================
-- Corrige un bug identifié à l'audit (passage 74) : duration_minutes n'a
-- jamais eu de contrainte serveur, contrairement à max_participants
-- (events_max_participants_positive, supabase-events-v2.sql). Le formulaire
-- client (EventCreateForm/EventEditForm) utilise un <input type="number"
-- min="1">, mais l'attribut "min" n'empêche pas de taper "-30" ou "0" au
-- clavier — ce n'est qu'une aide native de <form>, jamais déclenchée ici
-- (soumission par onClick, pas par submit). Une durée négative ou nulle
-- était donc acceptée SILENCIEUSEMENT par create_event() et par l'UPDATE
-- direct d'EventEditForm, avec deux conséquences visibles :
--   - durationLabel() (EventDetailView.jsx) affichait des valeurs absurdes
--     comme "-1 h -30" pour une durée de -30 minutes (le modulo JS conserve
--     le signe du dividende) ;
--   - l'export .ics (calendarExport.js) calculait une heure de fin
--     ANTÉRIEURE à l'heure de début.
-- Le correctif client (garde côté formulaire) est déjà en place ; ce script
-- ajoute la garde serveur manquante, symétrique à celle de
-- max_participants, pour bloquer aussi tout appel direct à l'API/RPC.
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Contrainte table — symétrique à events_max_participants_positive.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_duration_minutes_positive') then
    alter table events add constraint events_duration_minutes_positive
      check (duration_minutes is null or duration_minutes > 0);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. create_event() — restate complet (signature avec p_timezone, la plus
-- récente : supabase-events-timezone.sql), ajout de la validation
-- p_duration_minutes juste à côté de celle de p_max_participants.
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
