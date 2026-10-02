-- ============================================================================
-- CORRECTIF — un owner de communaute / organisateur d'evenement BANNI ou
-- SUSPENDU (profiles.banned_at / suspended_until, PAS une suppression de
-- compte) reste pleinement capable de gerer sa communaute/son evenement par
-- appel direct a l'API Supabase (PostgREST/RPC), malgre l'ecran "compte
-- banni" qui bloque bien la navigation normale dans l'app.
--
-- MISSION (audit du 2026-10-02, jour de lancement) : verifier si le
-- bannissement plateforme d'un owner/organisateur unique cree un "owner
-- fantome" (toujours proprietaire en base, suppose incapable d'agir).
--
-- CE QUI EST DEJA CORRECTEMENT BLOQUE (verifie, pas touche ici) :
-- App.jsx, fonction applyOwnProfile() (~ligne 1039) : "if (own.banned_at) {
-- setView('banned') }" s'applique a CHAQUE chargement de session, pour
-- TOUT compte, sans distinction de role communautaire/evenementiel — un
-- owner banni qui se reconnecte (ou recharge l'app) atterrit bien sur
-- l'ecran "compte banni", exactement comme n'importe quel autre compte. Ce
-- chemin precis n'a PAS de trou specifique aux actions de gestion
-- communautaire : la redirection est globale, posee une seule fois sur le
-- profil courant, jamais conditionnee a un role.
--
-- CE QUI NE L'EST PAS (trouve par cet audit) : comme deja identifie et
-- corrige a plusieurs reprises pour d'autres tables (voir
-- supabase-posts-account-state-guard-fix.sql,
-- supabase-target-account-state-guards-CONSOLIDATED-fix.sql,
-- supabase-content-account-state-block-guards-remaining-fix.sql, etc.), le
-- blocage "own.banned_at -> setView('banned')" dans App.jsx est REEL pour
-- l'app elle-meme mais n'a toujours ete qu'un garde cote CLIENT. Une session
-- Supabase deja ouverte (JWT valide) n'est pas revoquee par un bannissement
-- posterieur, et RIEN cote base ne verifie l'etat du compte de l'ACTEUR pour
-- les actions de GESTION d'une communaute/d'un evenement — contrairement
-- aux tables de contenu (posts/likes/comments/reactions/...) deja
-- auditees. Verifie policy par policy (lecture de supabase-communities.sql,
-- supabase-events-v2.sql, et des deux correctifs orphelins encore jamais
-- executes en prod au 2026-10-02 d'apres DEPLOIEMENT.md) :
--
--   - communities / "Le staff modifie sa communaute" (UPDATE) :
--     using (is_community_staff(id)) — aucun garde d'etat de compte.
--   - communities / "Le proprietaire supprime sa communaute" (DELETE) :
--     using (community_member_role(id, current_profile_id()) = 'owner') —
--     idem.
--   - community_members / "Changement de role selon la hierarchie"
--     (UPDATE) et "Quitter ou etre retire selon la hierarchie" (DELETE) :
--     idem (verifie aussi dans l'etat le plus recent de ces deux policies,
--     celui des correctifs supabase-community-orphan-guard-fix.sql /
--     supabase-community-role-change-orphan-fix.sql — ⬜ JAMAIS EXECUTES en
--     prod au 2026-10-02 d'apres DEPLOIEMENT.md — qui ajoutent une garde
--     anti-orphelin mais pas de garde d'etat de compte).
--   - community_reports / "Le staff/moderation traite les signalements"
--     (UPDATE), community_invites / "Le staff cree des invitations"
--     (INSERT) et "Le staff revoque une invitation" (UPDATE) : idem.
--   - accept_join_request(p_request_id) / reject_join_request(p_request_id)
--     (RPC SECURITY DEFINER) : verifient uniquement
--     is_community_staff(v_community_id), jamais l'etat du compte de
--     current_profile_id().
--   - events / "Le staff modifie son evenement" (UPDATE) : using
--     (is_event_staff(id)) — meme trou, cote evenements.
--   - event_staff / "Changement de role selon la hierarchie evenement"
--     (UPDATE) et "Quitter le staff ou etre retire par l'organisateur"
--     (DELETE) : idem.
--   - event_reports / "Le staff traite les signalements" (UPDATE) et
--     event_invitations / "Le staff revoque une invitation" (UPDATE) : idem.
--
-- IMPACT CONCRET : un owner/organisateur banni ou suspendu dont la session
-- navigateur reste ouverte (ou qui rejoue une requete API interceptee avant
-- son bannissement, ou qui script un appel direct a l'API) peut, tant que
-- son JWT Supabase n'a pas expire, CONTINUER A : modifier le nom/la
-- description/la visibilite de sa communaute, la supprimer, promouvoir/
-- retrograder/exclure des membres, accepter ou refuser des demandes
-- d'adhesion, creer/revoquer des invitations, traiter des signalements, et
-- l'equivalent cote evenement (modifier l'evenement, gerer le staff,
-- traiter les signalements, revoquer des invitations) — alors meme que
-- l'app affiche deja un ecran "compte banni" a quiconque recharge la page.
-- Inversement (reponse au point 2 de la mission) : CE correctif retire la
-- derniere raison de douter du scenario "owner fantome" ailleurs que sur ce
-- trou precis — une fois execute, un owner/organisateur banni ne peut
-- plus agir DU TOUT (ni via l'UI, deja bloquee, ni via l'API), et devient
-- donc un vrai "owner fantome" technique (ligne community_members/
-- event_staff intacte, mais plus aucune action possible) exactement comme
-- decrit dans la mission — sans qu'aucune fonctionnalite de transfert de
-- propriete force n'existe aujourd'hui pour qu'un admin plateforme
-- reaffecte la communaute/l'evenement a un autre membre. Cette absence de
-- transfert est une lacune FONCTIONNELLE distincte (deja confirmee par
-- ailleurs), deliberement non traitee ici : elle demanderait une nouvelle
-- RPC admin_reassign_community_owner (ou equivalent evenement) avec ses
-- propres regles de choix du nouveau owner — hors perimetre d'un correctif
-- livre un jour de lancement. Documentee pour decision ulterieure.
--
-- HORS PERIMETRE (volontairement) : accept_invite() (l'INVITE accepte une
-- invitation a rejoindre une communaute — pas une action de gestion par un
-- owner/organisateur) a la meme lacune generale, mais ne correspond pas au
-- scenario "owner/organisateur banni agit toujours comme owner/organisateur"
-- vise par cette mission ; laisse de cote pour rester precis plutot
-- qu'exhaustif. De meme, les gardes onboarding_completed_at/
-- deletion_requested_at (poses sur les tables de CONTENU dans les
-- correctifs cites plus haut) ne sont pas ajoutes ici : un owner/organisateur
-- a par construction deja une communaute/un evenement existant(e), le
-- scenario pertinent pour la gestion est banni/suspendu, pas onboarding
-- incomplet.
--
-- CORRECTIF : ajoute, sur chaque policy/RPC listee ci-dessus, exactement le
-- meme garde "not exists (select 1 from profiles p where p.id =
-- current_profile_id() and (p.banned_at is not null or
-- (p.suspended_until is not null and p.suspended_until > now())))" deja
-- utilise partout ailleurs dans ce depot pour ce type de garde — en ligne,
-- sans nouvelle fonction partagee, pour rester coherent avec le style de
-- tous les correctifs "account-state guard" precedents (jamais de fonction
-- commune pour ce garde precis dans ce depot, verifie avant d'ecrire ce
-- fichier). Pour "community_members" (UPDATE/DELETE), ce fichier redefinit
-- les policies dans leur etat le PLUS RECENT CONNU (celui des deux
-- correctifs anti-orphelin cites plus haut, encore jamais executes en prod)
-- plutot que l'etat d'origine de supabase-communities.sql, pour ne jamais
-- regresser la garde anti-orphelin si Patrick choisit d'executer ce fichier
-- avant, apres, ou a la place des deux autres (les trois sont idempotents et
-- convergent vers le meme etat final quel que soit l'ordre).
--
-- Additif et sans risque de regression pour un compte en regle : chaque
-- "not exists" ajoute ne porte que sur l'etat banni/suspendu de l'ACTEUR
-- (current_profile_id()), jamais sur le contenu ni sur un autre profil.
--
-- A EXECUTER PAR PATRICK dans Supabase SQL Editor, en une fois, apres
-- supabase-communities.sql et supabase-events-v2.sql. JAMAIS EXECUTE contre
-- la base de production par cette session (regle de securite de cet audit).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. "communities" — UPDATE (editer) et DELETE (supprimer).
-- ----------------------------------------------------------------------------
drop policy if exists "Le staff modifie sa communaute" on public.communities;
create policy "Le staff modifie sa communaute"
on communities for update
using (
  is_community_staff(id)
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

drop policy if exists "Le proprietaire supprime sa communaute" on public.communities;
create policy "Le proprietaire supprime sa communaute"
on communities for delete
using (
  community_member_role(id, current_profile_id()) = 'owner'
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

-- ----------------------------------------------------------------------------
-- B. "community_members" — UPDATE (changement de role) et DELETE (depart/
-- exclusion). Reprend l'etat le plus recent connu de ces deux policies
-- (garde anti-orphelin de supabase-community-role-change-orphan-fix.sql /
-- supabase-community-orphan-guard-fix.sql, redefinie ici a l'identique pour
-- que ce fichier reste executable seul dans n'importe quel ordre) et y
-- ajoute le garde d'etat de compte de l'acteur.
-- ----------------------------------------------------------------------------
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

drop policy if exists "Changement de role selon la hierarchie" on public.community_members;
create policy "Changement de role selon la hierarchie"
on community_members for update
using (
  (
    (
      community_member_role(community_id, current_profile_id()) = 'owner'
      and not (
        profile_id = current_profile_id()
        and community_would_be_orphaned_by_leaving(community_id, current_profile_id())
      )
    )
    or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
  )
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
)
with check (
  community_member_role(community_id, current_profile_id()) = 'owner'
  or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
);

drop policy if exists "Quitter ou etre retire selon la hierarchie" on public.community_members;
create policy "Quitter ou etre retire selon la hierarchie"
on community_members for delete
using (
  (
    (profile_id = current_profile_id() and not community_would_be_orphaned_by_leaving(community_id, current_profile_id()))
    or (community_member_role(community_id, current_profile_id()) = 'owner' and profile_id <> current_profile_id())
    or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
  )
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

-- ----------------------------------------------------------------------------
-- C. "community_reports" (traitement des signalements) et "community_invites"
-- (creation/revocation d'invitations par le staff).
-- ----------------------------------------------------------------------------
drop policy if exists "Le staff/moderation traite les signalements" on public.community_reports;
create policy "Le staff/moderation traite les signalements"
on community_reports for update
using (
  is_community_mod(community_id)
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

drop policy if exists "Le staff cree des invitations" on public.community_invites;
create policy "Le staff cree des invitations"
on community_invites for insert
with check (
  invited_by = current_profile_id()
  and is_community_staff(community_id)
  and not exists (
    select 1 from blocks
    where (blocks.from_id = invited_by and blocks.to_id = invited_profile_id)
       or (blocks.from_id = invited_profile_id and blocks.to_id = invited_by)
  )
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

drop policy if exists "Le staff revoque une invitation" on public.community_invites;
create policy "Le staff revoque une invitation"
on community_invites for update
using (
  is_community_staff(community_id)
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

-- ----------------------------------------------------------------------------
-- D. accept_join_request / reject_join_request — RPC SECURITY DEFINER
-- utilisees par le staff pour approuver/refuser une demande d'adhesion.
-- ----------------------------------------------------------------------------
create or replace function accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid; v_profile_id uuid;
begin
  if exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  ) then
    raise exception 'Non autorise';
  end if;

  select community_id, profile_id into v_community_id, v_profile_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  if not is_community_staff(v_community_id) then
    raise exception 'Non autorise';
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

create or replace function reject_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid;
begin
  if exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  ) then
    raise exception 'Non autorise';
  end if;

  select community_id into v_community_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  if not is_community_staff(v_community_id) then
    raise exception 'Non autorise';
  end if;

  update community_join_requests
  set status = 'rejected', decided_at = now(), decided_by = current_profile_id()
  where id = p_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- E. "events" — UPDATE (editer). Pas de policy DELETE sur "events" (par
-- conception : annulation/archivage seulement, voir supabase-events-v2.sql),
-- rien a corriger de ce cote.
-- ----------------------------------------------------------------------------
drop policy if exists "Le staff modifie son evenement" on public.events;
create policy "Le staff modifie son evenement"
on events for update
using (
  is_event_staff(id)
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

-- ----------------------------------------------------------------------------
-- F. "event_staff" — UPDATE (changement de role) et DELETE (depart/exclusion
-- du staff).
-- ----------------------------------------------------------------------------
drop policy if exists "Changement de role selon la hierarchie evenement" on public.event_staff;
create policy "Changement de role selon la hierarchie evenement"
on event_staff for update
using (
  (
    event_staff_role(event_id, current_profile_id()) = 'organizer'
    or (event_staff_role(event_id, current_profile_id()) = 'co_organizer' and role = 'moderator')
  )
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
)
with check (
  event_staff_role(event_id, current_profile_id()) = 'organizer'
  or (event_staff_role(event_id, current_profile_id()) = 'co_organizer' and role = 'moderator')
);

drop policy if exists "Quitter le staff ou etre retire par l'organisateur" on public.event_staff;
create policy "Quitter le staff ou etre retire par l'organisateur"
on event_staff for delete
using (
  (
    (profile_id = current_profile_id() and role <> 'organizer')
    or (event_staff_role(event_id, current_profile_id()) = 'organizer' and profile_id <> current_profile_id())
  )
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

-- ----------------------------------------------------------------------------
-- G. "event_reports" (traitement des signalements) et "event_invitations"
-- (revocation d'une invitation par le staff).
-- ----------------------------------------------------------------------------
drop policy if exists "Le staff traite les signalements" on public.event_reports;
create policy "Le staff traite les signalements"
on event_reports for update
using (
  is_event_mod(event_id)
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
);

drop policy if exists "Le staff revoque une invitation" on public.event_invitations;
create policy "Le staff revoque une invitation"
on event_invitations for update
using (
  is_event_mod(event_id)
  and not exists (
    select 1 from profiles p
    where p.id = current_profile_id()
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
)
with check (status = 'declined');

-- ----------------------------------------------------------------------------
-- Verification (facultatif, a executer separement apres, avec un profil de
-- test que l'on bannit via admin_ban_user()/update manuel de banned_at) :
--
-- -- 1. Doit ECHOUER (0 ligne affectee / erreur RLS) une fois le profil de
-- -- test banni, alors qu'il reste 'owner' dans community_members :
-- update communities set name = 'x' where id = '<uuid-communaute-test>';
-- delete from communities where id = '<uuid-communaute-test>';
-- update community_members set role = 'member'
--   where community_id = '<uuid-communaute-test>' and profile_id = '<uuid-autre-membre>';
-- delete from community_members
--   where community_id = '<uuid-communaute-test>' and profile_id = '<uuid-autre-membre>';
-- select accept_join_request('<uuid-demande-test>');
-- select reject_join_request('<uuid-demande-test>');
--
-- -- 2. Meme verification cote evenement (events/event_staff/event_reports/
-- -- event_invitations) avec un organisateur de test banni.
--
-- -- 3. Doit toujours REUSSIR sans changement de comportement pour un compte
-- -- en regle (non banni, non suspendu) : memes operations, profil de test
-- -- non banni.
-- ============================================================================
