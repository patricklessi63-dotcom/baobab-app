-- ============================================================================
-- Garde-fous événements passés / annulés. À exécuter dans Supabase : SQL
-- Editor, APRÈS supabase-events-v2.sql (et supabase-events-timezone.sql si
-- déjà appliqué — indépendant de celui-ci, ordre arbitraire entre les deux).
-- ============================================================================
-- Corrige deux bugs identifiés à l'audit du flux "Événements" :
--
-- 1. join_event() et accept_event_invitation() ne vérifiaient jamais que
--    l'événement était encore à venir. Un événement déjà passé restait
--    accessible (ex: depuis "Mes événements" avec un statut "interested",
--    ou via un lien direct) et le bouton "Participer" appelait join_event()
--    sans aucun blocage côté serveur — seul le correctif front (masquage du
--    bouton dans EventDetailView.jsx) protégeait l'utilisateur normal, pas
--    un appel direct à l'API REST/RPC.
--
-- 2. La policy INSERT de "event_invitations" n'excluait pas les événements
--    annulés (canceled_at) : contrairement à join_event/event_media/
--    event_comments qui bloquent déjà ce cas, on pouvait toujours inviter
--    quelqu'un à un événement annulé.
-- ----------------------------------------------------------------------------

create or replace function join_event(p_event_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_max int; v_canceled timestamptz; v_date timestamptz; v_going int; v_status text; v_row event_attendees;
begin
  select max_participants, canceled_at, event_date into v_max, v_canceled, v_date from events where id = p_event_id for update;
  if not found then raise exception 'Evenement introuvable'; end if;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;
  if v_date is not null and v_date <= now() then raise exception 'Cet evenement est deja passe'; end if;
  if not can_view_event(p_event_id) then raise exception 'Non autorise'; end if;

  select count(*) into v_going from event_attendees where event_id = p_event_id and status = 'going';
  v_status := case when v_max is null or v_going < v_max then 'going' else 'waitlisted' end;

  insert into event_attendees (event_id, profile_id, status)
  values (p_event_id, current_profile_id(), v_status)
  on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now()
  returning * into v_row;

  insert into notifications (recipient_id, type, actor_id, target_type, target_id, payload)
  values (current_profile_id(), 'event_participation_confirmed', current_profile_id(), 'event', p_event_id,
    jsonb_build_object('status', v_status));

  return v_row;
end;
$$;

create or replace function accept_event_invitation(p_invitation_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_event_id uuid; v_max int; v_canceled timestamptz; v_date timestamptz; v_going int; v_status text; v_row event_attendees;
begin
  select event_id into v_event_id from event_invitations
    where id = p_invitation_id and status = 'pending' and invited_profile_id = current_profile_id()
    for update;
  if not found then raise exception 'Invitation introuvable ou deja traitee'; end if;

  select max_participants, canceled_at, event_date into v_max, v_canceled, v_date from events where id = v_event_id for update;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;
  if v_date is not null and v_date <= now() then raise exception 'Cet evenement est deja passe'; end if;

  update event_invitations set status = 'accepted' where id = p_invitation_id;

  select count(*) into v_going from event_attendees where event_id = v_event_id and status = 'going';
  v_status := case when v_max is null or v_going < v_max then 'going' else 'waitlisted' end;

  insert into event_attendees (event_id, profile_id, status)
  values (v_event_id, current_profile_id(), v_status)
  on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Invitations : plus possible d'inviter à un événement déjà annulé (miroir
-- de la protection déjà en place sur event_media/event_comments/join_event).
drop policy if exists "Inviter en son propre nom si participant et connexion reelle" on event_invitations;
create policy "Inviter en son propre nom si participant et connexion reelle"
on event_invitations for insert
with check (
  invited_by = current_profile_id()
  and not exists (select 1 from events e where e.id = event_id and e.canceled_at is not null)
  and (is_event_participant(event_id) or is_event_mod(event_id))
  and (
    (
      exists (select 1 from likes where from_id = current_profile_id() and to_id = invited_profile_id)
      and exists (select 1 from likes where from_id = invited_profile_id and to_id = current_profile_id())
    )
    or (
      (select community_id from events where id = event_id) is not null
      and is_community_member((select community_id from events where id = event_id))
    )
  )
);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname, prosrc ilike '%deja passe%' from pg_proc where proname in ('join_event','accept_event_invitation');
-- select policyname, cmd from pg_policies where tablename = 'event_invitations';
-- ============================================================================
