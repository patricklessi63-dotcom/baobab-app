-- ============================================================================
-- CORRECTIF — accept_event_invitation() ne revérifie pas l'appartenance à la
-- communauté au moment d'ACCEPTER une invitation à un événement
-- `visibility = 'community'`, contrairement à join_event() qui appelle déjà
-- can_view_event() pour la même vérification.
--
-- TROUVÉ (audit "quitter une communauté", 2026-09-30) : le correctif client
-- (commit 52a4ebd) décline désormais côté UI les invitations event_invitations
-- encore "pending" quand un membre quitte une communauté, pour un événement
-- `visibility='community'` de cette communauté. Mais ce n'est qu'un geste
-- côté client au moment du départ — si l'invitation existe encore ENTRE le
-- moment où le membre a quitté (par un autre chemin, ex. exclusion par le
-- staff, ou une fenêtre de course avant que le correctif client ne s'exécute)
-- et le moment où il clique "Accepter" sur une notification déjà reçue,
-- accept_event_invitation() ne revérifie JAMAIS qu'il est toujours membre :
-- il suffit que l'invitation soit encore "pending" (vérifié) pour que
-- l'acceptation réussisse, sans revérifier can_view_event()/is_community_
-- member(). Un ex-membre peut donc rejoindre un événement réservé aux
-- membres de la communauté qu'il vient de quitter.
--
-- CORRECTIF : ajoute la même vérification que join_event() — can_view_event
-- (qui couvre déjà tous les cas de visibilité, pas seulement 'community') —
-- juste avant d'insérer la ligne event_attendees. Redéfinit uniquement
-- accept_event_invitation(), sans toucher decline_event_invitation() (une
-- déclinaison n'a pas besoin de cette garde, elle ne donne aucun accès).
-- Idempotent (create or replace), sans risque de régression pour un membre
-- toujours légitime : can_view_event() renvoie déjà true pour tous les cas
-- déjà couverts (public, membre actuel d'une communauté, événement privé où
-- l'invité a bien reçu son invitation). À exécuter dans le SQL Editor de
-- Supabase, après supabase-events-v2.sql. Jamais exécuté contre la base de
-- production par cette session.
-- ============================================================================

create or replace function accept_event_invitation(p_invitation_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_event_id uuid; v_max int; v_canceled timestamptz; v_going int; v_status text; v_row event_attendees;
begin
  select event_id into v_event_id from event_invitations
    where id = p_invitation_id and status = 'pending' and invited_profile_id = current_profile_id()
    for update;
  if not found then raise exception 'Invitation introuvable ou deja traitee'; end if;

  if not can_view_event(v_event_id) then
    raise exception 'Tu n''as plus acces a cet evenement (ex. tu as quitte la communaute concernee)';
  end if;

  select max_participants, canceled_at into v_max, v_canceled from events where id = v_event_id for update;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;

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

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) — la fonction doit
-- contenir "can_view_event" :
-- select prosrc from pg_proc where proname = 'accept_event_invitation';
-- ============================================================================
