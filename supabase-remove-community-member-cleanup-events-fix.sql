-- ============================================================================
-- CORRECTIF — l'exclusion d'un membre par le staff d'une communauté ne nettoie
-- ni ses invitations en attente ni ses participations aux événements
-- `visibility = 'community'` de cette communauté.
--
-- TROUVÉ (audit du 30 septembre 2026, DEPLOIEMENT.md ancienne section 6) :
-- `handleRemoveMember` (src/components/social/CommunitiesTab.jsx) se contentait
-- d'un `DELETE FROM community_members`. Un membre exclu de force gardait donc
-- ses invitations « pending » aux événements réservés aux membres de cette
-- communauté et restait inscrit (`going` / `waitlisted`) à ceux déjà confirmés,
-- alors que `can_view_event()` exige `is_community_member()` pour ce type
-- d'événement. Le départ volontaire (`handleLeave`, commit 52a4ebd) était déjà
-- corrigé côté client, mais ce correctif NE PEUT PAS être réutilisé par le
-- staff :
--   - `decline_event_invitation()` exige `invited_profile_id = current_profile_id()`
--     (seul l'invité·e peut décliner) ;
--   - la policy DELETE d'`event_attendees` exige `profile_id = current_profile_id()`
--     OU `is_event_mod(event_id)` (rôle dans `event_staff` de CET événement, pas
--     rôle dans la communauté).
-- Un owner/admin qui exclut quelqu'un n'a donc, en général, aucun droit pour
-- nettoyer les lignes d'un tiers : la requête « réussissait » sans rien faire.
--
-- CORRECTIF : une fonction SECURITY DEFINER
--
--     remove_community_member_and_cleanup_events(p_member_id uuid) returns void
--
-- qui, dans UNE SEULE transaction (une fonction plpgsql est atomique : si une
-- étape échoue, tout est annulé, le membre reste membre) :
--   1. vérifie que l'appelant a le droit de retirer ce membre — EXACTEMENT la
--      règle de la policy DELETE actuelle de `community_members`
--      (« Quitter ou etre retire selon la hierarchie », version de
--      supabase-community-event-governance-banned-staff-fix.sql) :
--        - se retirer soi-même, sauf si cela orphelinerait la communauté
--          (dernier owner/admin) ;
--        - owner : retire n'importe qui d'autre que lui-même ;
--        - admin : retire un `moderator` ou un `member` ;
--        - jamais un compte banni ou suspendu ;
--   2. décline (`status = 'declined'`) les invitations « pending » de ce membre
--      aux événements `visibility = 'community'`, non annulés et à venir, de
--      cette communauté (mêmes critères que le nettoyage de `handleLeave`) ;
--   3. supprime ses lignes `event_attendees` pour ces mêmes événements (tous
--      statuts : going / waitlisted / interested / not_going) — le trigger
--      `trg_promote_waitlist` promeut ensuite normalement la liste d'attente ;
--   4. supprime enfin la ligne `community_members`.
-- Le nettoyage (2 et 3) passe AVANT la suppression (4) : ensuite, la RLS de
-- `events` ne laisserait plus rien voir de ces événements.
--
-- Le client (`handleRemoveMember`) appelle désormais cette fonction par
-- `supabase.rpc(...)` à la place du `.delete()` direct.
--
-- Cette fonction ne REMPLACE PAS la policy DELETE de `community_members` : le
-- DELETE direct reste possible (et reste régi par la même règle), il ne
-- nettoie simplement pas les événements. Aucune policy n'est modifiée ici.
--
-- LIMITES CONNUES (volontaires) :
--   - Seuls les événements `visibility = 'community'` sont nettoyés. Les
--     événements publics ou privés de la même communauté ne dépendent pas de
--     l'appartenance et ne sont pas touchés.
--   - Les événements DÉJÀ PASSÉS ou annulés ne sont pas touchés (comme dans
--     `handleLeave`) : l'historique de participation reste intact.
--   - Si le membre exclu était organisateur (`event_staff`) d'un événement
--     de la communauté, sa ligne `event_staff` n'est pas modifiée : hors
--     périmètre de ce correctif.
--   - Une exclusion simultanée par deux membres du staff fait échouer la
--     seconde avec « Membre introuvable » (la ligne n'existe plus) : voulu,
--     pour que le client ne décrémente pas deux fois le compteur de membres.
--
-- Dépendances (déjà en production) : `current_profile_id()`,
-- `community_member_role()` (supabase-communities.sql), les tables
-- `events`, `event_invitations`, `event_attendees` (supabase-events-v2.sql).
-- `community_would_be_orphaned_by_leaving()` est redéfinie ci-dessous À
-- L'IDENTIQUE de supabase-community-event-governance-banned-staff-fix.sql
-- pour que ce fichier reste exécutable seul, dans n'importe quel ordre.
--
-- Idempotent (`create or replace function`). Rétroaction : la dernière section
-- du fichier donne le retour arrière (`drop function`). À exécuter dans le SQL
-- Editor de Supabase. Ordre : le client déployé AVANT ce SQL appellerait une
-- fonction inexistante et l'exclusion échouerait avec « Impossible de retirer
-- ce membre » — exécuter ce SQL AVANT de déployer le client qui l'appelle.
--
-- LIVRÉ POUR EXÉCUTION MANUELLE FUTURE PAR PATRICK — PAS EXÉCUTÉ ICI. Validé
-- uniquement sur un schéma factice PGlite (src/native/removeCommunityMember.test.js),
-- jamais sur la base Supabase réelle.
-- ============================================================================

create or replace function community_would_be_orphaned_by_leaving(p_community_id uuid, p_leaving_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select community_member_role(p_community_id, p_leaving_profile_id) in ('owner','admin')
    and not exists (
      select 1 from community_members cm
      where cm.community_id = p_community_id
        and cm.profile_id <> p_leaving_profile_id
        and cm.role in ('owner','admin')
    );
$$;

create or replace function remove_community_member_and_cleanup_events(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_actor_id uuid := current_profile_id();
  v_actor_role text;
  v_community_id uuid;
  v_profile_id uuid;
  v_role text;
begin
  if v_actor_id is null then
    raise exception 'Non authentifie';
  end if;

  -- Un compte banni ou suspendu ne peut ni modérer ni se retirer (même garde
  -- que la policy DELETE de community_members).
  if exists (
    select 1 from profiles p
    where p.id = v_actor_id
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  ) then
    raise exception 'Droits insuffisants pour retirer ce membre';
  end if;

  -- Verrou sur la ligne : deux exclusions simultanées s'enchaînent, la
  -- seconde ne trouve plus la ligne.
  select cm.community_id, cm.profile_id, cm.role
    into v_community_id, v_profile_id, v_role
  from community_members cm
  where cm.id = p_member_id
  for update;
  if not found then
    raise exception 'Membre introuvable';
  end if;

  v_actor_role := community_member_role(v_community_id, v_actor_id);

  -- Règle de la policy DELETE « Quitter ou etre retire selon la hierarchie ».
  -- ATTENTION NULL : pour un appelant étranger à la communauté,
  -- v_actor_role est NULL et la condition vaut NULL (pas false) ; « if not
  -- NULL » ne lèverait RIEN et laisserait passer l'appel. D'où « is not true »
  -- (une policy RLS, elle, traite NULL comme un refus).
  if (
    (v_profile_id = v_actor_id and not community_would_be_orphaned_by_leaving(v_community_id, v_actor_id))
    or (v_actor_role = 'owner' and v_profile_id <> v_actor_id)
    or (v_actor_role = 'admin' and v_role in ('moderator','member'))
  ) is not true then
    raise exception 'Droits insuffisants pour retirer ce membre';
  end if;

  -- Événements « réservés aux membres » à venir et non annulés de cette
  -- communauté (mêmes critères que handleLeave).
  update event_invitations ei
  set status = 'declined'
  where ei.invited_profile_id = v_profile_id
    and ei.status = 'pending'
    and ei.event_id in (
      select e.id from events e
      where e.community_id = v_community_id
        and e.visibility = 'community'
        and e.canceled_at is null
        and e.event_date >= now()
    );

  delete from event_attendees ea
  where ea.profile_id = v_profile_id
    and ea.event_id in (
      select e.id from events e
      where e.community_id = v_community_id
        and e.visibility = 'community'
        and e.canceled_at is null
        and e.event_date >= now()
    );

  delete from community_members where id = p_member_id;
end;
$$;

-- Même motif que les autres fonctions SECURITY DEFINER appelables par le
-- client (supabase-security-definer-revoke-grant-audit-fix.sql) : jamais
-- appelable par un visiteur non connecté.
revoke all on function remove_community_member_and_cleanup_events(uuid) from public;
revoke all on function remove_community_member_and_cleanup_events(uuid) from anon;
grant execute on function remove_community_member_and_cleanup_events(uuid) to authenticated;

-- La fonction d'aide ci-dessus (SECURITY DEFINER) ne doit pas non plus être
-- appelable par un visiteur non connecté : elle révélerait si un profil donné
-- est le dernier owner/admin d'une communauté. `authenticated` garde EXECUTE
-- (la policy DELETE de community_members l'appelle avec les droits du client).
revoke all on function community_would_be_orphaned_by_leaving(uuid, uuid) from public;
revoke all on function community_would_be_orphaned_by_leaving(uuid, uuid) from anon;
grant execute on function community_would_be_orphaned_by_leaving(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
--
-- -- 1. La fonction existe, est SECURITY DEFINER et n'est pas appelable par anon :
-- select prosecdef, has_function_privilege('anon', oid, 'execute') as anon_peut,
--        has_function_privilege('authenticated', oid, 'execute') as authenticated_peut
-- from pg_proc where proname = 'remove_community_member_and_cleanup_events';
-- -- attendu : true | false | true
--
-- -- 2. Scénario bout en bout (avec deux comptes de test, jamais en production
-- -- réelle) : un owner/admin exclut un membre de test ayant (a) une invitation
-- -- « pending » et (b) une participation « going » à un événement
-- -- visibility='community' à venir de cette communauté.
-- -- Connecté en tant que l'owner/admin, via l'application ou :
-- --   select remove_community_member_and_cleanup_events('<uuid-ligne-community_members-du-membre>');
-- -- Puis, en SQL Editor (droits élevés) :
-- --   select status from event_invitations
-- --    where invited_profile_id = '<uuid-profil-membre>' and event_id = '<uuid-evenement>';  -- 'declined'
-- --   select count(*) from event_attendees
-- --    where profile_id = '<uuid-profil-membre>' and event_id = '<uuid-evenement>';          -- 0
-- --   select count(*) from community_members where id = '<uuid-ligne-membre>';              -- 0
--
-- -- 3. Contrôle négatif : appelée par un simple membre (ou un admin ciblant un
-- -- autre admin), la fonction doit lever « Droits insuffisants pour retirer
-- -- ce membre » et ne rien modifier.
--
-- ----------------------------------------------------------------------------
-- RETOUR ARRIÈRE (à exécuter seulement pour annuler ce correctif ; le client
-- doit alors revenir au `.delete()` direct, sinon l'exclusion échoue) :
--
--   drop function if exists remove_community_member_and_cleanup_events(uuid);
--
-- (community_would_be_orphaned_by_leaving() est partagée avec d'autres
-- fichiers : ne pas la supprimer.)
-- ============================================================================
