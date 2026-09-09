-- ============================================================================
-- Correctif : oracle d'existence via message d'erreur différentiel (IDOR
-- "binaire") sur join_event()/accept_join_request()/reject_join_request().
--
-- Angle inédit de cette passe d'audit : pas une fuite de colonnes ni une
-- liste sans limite (patterns déjà clos ce soir), mais une fuite
-- d'information via le CONTENU du message d'erreur d'une RPC qui prend un
-- UUID en paramètre.
--
-- Constat (lecture du code, confirmé par relecture des définitions SQL
-- actuellement déployées) :
--
-- 1. join_event(p_event_id uuid) [supabase-events-guards.sql] :
--      - UUID inexistant                         -> 'Evenement introuvable'
--      - UUID existant mais can_view_event() faux -> 'Non autorise'
--      - UUID existant, visible, mais annulé      -> 'Cet evenement est annule'
--      - UUID existant, visible, mais passé       -> 'Cet evenement est deja passe'
--    N'importe quel utilisateur AUTHENTIFIÉ peut donc distinguer "cet id
--    n'existe pas" de "cet id existe mais m'est fermé" — et même, pour un
--    événement fermé, savoir en plus s'il est annulé ou déjà passé — pour
--    un événement privé/communautaire auquel il n'a jamais eu accès (lien
--    partagé puis retiré, invitation révoquée, ancien membre d'une
--    communauté qu'il a quittée, ou simple essai d'UUID au hasard).
--
-- 2. accept_join_request(p_request_id uuid) et reject_join_request(...)
--    [supabase-communities.sql] :
--      - UUID inexistant OU déjà traité -> 'Demande introuvable ou deja traitee'
--      - UUID existant, en attente, mais staff communautaire faux -> 'Non autorise'
--    Même schéma : "Non autorise" confirme à n'importe quel utilisateur
--    authentifié qu'une demande d'adhésion EN ATTENTE existe avec cet UUID
--    précis dans UNE communauté quelconque (pas forcément la sienne), sans
--    jamais avoir eu de raison légitime de la consulter.
--
-- Sévérité pratique limitée (UUID v4 non énumérable par force brute), mais
-- même famille de bug que "confirmer qu'un compte/une ressource existe sans
-- y avoir droit" — corrigé ici en supprimant la branche d'erreur distincte
-- et en la fusionnant avec le message générique "introuvable", AVANT toute
-- autre vérification qui révélerait un détail supplémentaire (annulé/passé)
-- sur une ressource à laquelle l'appelant n'a de toute façon pas accès.
--
-- Aucune connexion active, aucune ligne modifiée : ce fichier redéfinit
-- uniquement le corps de trois fonctions déjà déployées, à exécuter
-- manuellement (jamais par l'agent) via l'éditeur SQL Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. join_event(p_event_id) — la vérification can_view_event() passe
--    maintenant AVANT toute autre vérification (annulé/passé), et son échec
--    est fusionné avec le cas "introuvable" plutôt que de lever 'Non autorise'.
-- ----------------------------------------------------------------------------
create or replace function join_event(p_event_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_max int; v_canceled timestamptz; v_date timestamptz; v_going int; v_status text; v_row event_attendees;
begin
  select max_participants, canceled_at, event_date into v_max, v_canceled, v_date from events where id = p_event_id for update;
  if not found then raise exception 'Evenement introuvable'; end if;
  -- Vérification d'accès déplacée ICI (avant tout autre exception) et
  -- message fusionné avec le cas "introuvable" : un événement privé auquel
  -- l'appelant n'a pas accès doit être indiscernable, dans la réponse
  -- d'erreur, d'un événement qui n'existe pas — que ce soit sur le simple
  -- fait de son existence, ou sur son statut (annulé/passé), qui ne
  -- regarde pas quelqu'un qui n'a de toute façon pas le droit de le voir.
  if not can_view_event(p_event_id) then raise exception 'Evenement introuvable'; end if;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;
  if v_date is not null and v_date <= now() then raise exception 'Cet evenement est deja passe'; end if;

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

-- ----------------------------------------------------------------------------
-- 2. accept_join_request(p_request_id) — 'Non autorise' fusionné avec le
--    message générique "introuvable ou deja traitee".
-- ----------------------------------------------------------------------------
create or replace function accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid; v_profile_id uuid;
begin
  select community_id, profile_id into v_community_id, v_profile_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  -- Message fusionné avec le cas "introuvable" ci-dessus (au lieu de 'Non
  -- autorise') : sinon, n'importe quel utilisateur authentifié pouvait
  -- confirmer qu'une demande d'adhésion EN ATTENTE existe avec un UUID
  -- donné dans une communauté quelconque, simplement en observant lequel
  -- des deux messages revient — sans jamais avoir été concerné par cette
  -- communauté.
  if not is_community_staff(v_community_id) then
    raise exception 'Demande introuvable ou deja traitee';
  end if;

  update community_join_requests
  set status = 'accepted', decided_at = now(), decided_by = current_profile_id()
  where id = p_request_id;

  insert into community_members (community_id, profile_id, role)
  values (v_community_id, v_profile_id, 'member')
  on conflict (community_id, profile_id) do nothing;

  insert into notifications (recipient_id, type, actor_id, community_id)
  values (v_profile_id, 'join_request_accepted', current_profile_id(), v_community_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. reject_join_request(p_request_id) — même correctif que ci-dessus.
-- ----------------------------------------------------------------------------
create or replace function reject_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid;
begin
  select community_id into v_community_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  -- Même fusion de message que accept_join_request() ci-dessus.
  if not is_community_staff(v_community_id) then
    raise exception 'Demande introuvable ou deja traitee';
  end if;

  update community_join_requests
  set status = 'rejected', decided_at = now(), decided_by = current_profile_id()
  where id = p_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Durcissement complémentaire (constaté en testant ce correctif, lecture
--    seule, avec la clé anonyme publique déjà présente dans le bundle
--    client — aucune mutation, aucun compte réel utilisé) : ces trois
--    fonctions n'ont JAMAIS eu de "revoke ... from public" contrairement à
--    unmatch_profile()/decline_invite() dans ce même projet. Un appel POST
--    anonyme (rôle "anon", sans session) sur
--    /rest/v1/rpc/join_event et /rest/v1/rpc/accept_join_request avec un
--    UUID au hasard exécute réellement la fonction et renvoie le message
--    d'erreur normal ('Evenement introuvable' / 'Demande introuvable ou deja
--    traitee') au lieu d'un refus de permission — l'oracle d'existence
--    corrigé ci-dessus était donc exploitable sans même créer de compte.
--    Le correctif de message ci-dessus le neutralise déjà (même message
--    dans les deux cas, authentifié ou non), mais on restreint aussi
--    l'exécution au rôle "authenticated" par défense en profondeur, comme
--    c'est déjà le cas pour les fonctions équivalentes du fichier.
-- ----------------------------------------------------------------------------
revoke all on function join_event(uuid) from public;
grant execute on function join_event(uuid) to authenticated;

revoke all on function accept_join_request(uuid) from public;
grant execute on function accept_join_request(uuid) to authenticated;

revoke all on function reject_join_request(uuid) from public;
grant execute on function reject_join_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname, prosrc from pg_proc where proname in ('join_event','accept_join_request','reject_join_request');
-- -- Confirmer qu'aucune des trois ne contient plus la chaîne 'Non autorise'.
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges
--   where routine_name in ('join_event','accept_join_request','reject_join_request');
-- -- Confirmer qu'il ne reste plus de ligne grantee = 'PUBLIC'/'anon'.
-- ============================================================================
