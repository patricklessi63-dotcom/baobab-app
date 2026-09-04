-- ============================================================================
-- Correctif — un compte ayant demandé la suppression de son profil
-- (deletion_requested_at, délai de grâce 24h, voir
-- supabase-account-deletion.sql / AccountDeletionBanner.jsx) peut encore
-- RECEVOIR (et ENVOYER) des actions dirigées via l'API, sans aucun contrôle
-- côté base. Même principe que supabase-banned-target-action-fix.sql et
-- supabase-onboarding-incomplete-target-action-fix.sql, généralisé à
-- deletion_requested_at.
--
-- CONTEXTE : requestAccountDeletion() (src/lib/deleteAccount.js) se contente
-- de poser profiles.deletion_requested_at = now() ; la suppression réelle
-- (Storage inclus) n'a lieu que 24h plus tard, via la tâche planifiée
-- process-scheduled-deletions. Le client vient d'être corrigé (candidates,
-- App.jsx) pour ne plus proposer ces profils "en attente de suppression"
-- dans Découverte — mais c'est un garde CÔTÉ CLIENT uniquement.
--
-- En auditant les mêmes policies RLS d'INSERT que pour les correctifs
-- banned/suspended et onboarding incomplet (likes, follows, favorites,
-- messages, event_invitations), AUCUNE ne consulte deletion_requested_at —
-- ni pour l'auteur de l'action, ni pour sa cible. Concrètement, par un appel
-- direct à l'API Supabase (fetch/PostgREST, hors UI) :
--   - n'IMPORTE QUEL compte peut encore liker, suivre, mettre en favori,
--     écrire ou inviter un profil qui vient de demander la suppression de
--     son compte, malgré l'écran "Découverte" qui ne le propose plus à
--     personne depuis le correctif client — créant un nouveau match/like
--     voué à disparaître sans préavis dans les 24h qui suivent ;
--   - un compte en attente de suppression peut lui-même continuer à agir
--     normalement (ce qui est VOULU, voir la note ci-dessous).
--
-- NUANCE PAR RAPPORT AUX DEUX CORRECTIFS PRÉCÉDENTS (à trancher par
-- l'équipe avant exécution) : supabase-account-deletion.sql documente
-- explicitement que le compte "reste pleinement fonctionnel (pas de
-- restriction d'accès pendant les 24h), seule la bannière côté client
-- change son comportement". Ce correctif-ci reprend malgré tout EXACTEMENT
-- le même gabarit symétrique (auteur OU cible) que pour banned/suspended et
-- onboarding incomplet, y compris sur "messages" — ce qui, contrairement
-- aux deux correctifs précédents, peut couper une conversation déjà
-- matchée AVANT la demande de suppression (pas seulement empêcher un
-- nouveau match) dès qu'un des deux comptes est en attente de suppression.
-- C'est un vrai changement de comportement pour des comptes qui n'ont rien
-- fait de mal (contrairement à banned/suspended) et qui ont simplement
-- demandé leur propre suppression — à évaluer par l'équipe : si ce n'est
-- pas le comportement voulu, retirer le bloc "messages" ci-dessous (section
-- 4) avant exécution, ou le restreindre pour ne bloquer que les NOUVEAUX
-- matchs (via "likes"/"follows"/"favorites"/"event_invitations", sections
-- 1/2/3/5) sans toucher aux conversations déjà en cours.
--
-- CORRECTIF (tel qu'appliqué ici) : réplique le garde-fou "not exists (...)"
-- déjà utilisé pour les blocages, banned/suspended et onboarding incomplet
-- sur ces mêmes tables, cette fois pour interdire toute nouvelle
-- interaction dès que L'UN DES DEUX profils (auteur ou cible) a
-- deletion_requested_at renseigné. Additif et sans risque de régression
-- pour les comptes n'ayant pas demandé leur suppression : la condition
-- n'ajoute qu'un NOT EXISTS supplémentaire aux checks déjà en place (repris
-- tels quels, y compris ceux des deux correctifs précédents). Fichier conçu
-- pour être exécuté indépendamment de l'ordre d'exécution avec les deux
-- fichiers précédents — chaque policy est redéfinie en entier, avec
-- l'ensemble cumulé des conditions (blocage + banni/suspendu + onboarding +
-- suppression en attente), pas seulement l'ajout.
--
-- Portée volontairement limitée aux interactions à SENS UNIQUE vers un
-- autre profil, comme pour les deux correctifs précédents.
-- "community_members" (rejoindre une communauté publique) n'a pas de profil
-- cible distinct et n'est donc pas touché ici.
--
-- IMPORTANT : fichier fourni pour revue/exécution manuelle par l'équipe.
-- Non exécuté automatiquement (règle de sécurité de cet audit).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "likes"
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'likes' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.likes', pol.policyname);
  end loop;

  create policy "Un utilisateur like en son propre nom"
  on likes for insert
  with check (
    auth.uid() = (select user_id from profiles where id = likes.from_id)
    and likes.from_id <> likes.to_id
    and not exists (
      select 1 from blocks
      where (blocks.from_id = likes.from_id and blocks.to_id = likes.to_id)
         or (blocks.from_id = likes.to_id and blocks.to_id = likes.from_id)
    )
    and not exists (
      select 1 from profiles p
      where p.id in (likes.from_id, likes.to_id)
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id in (likes.from_id, likes.to_id)
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id in (likes.from_id, likes.to_id)
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 2. "follows"
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'follows' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.follows', pol.policyname);
  end loop;

  create policy "Un utilisateur s'abonne en son propre nom"
  on follows for insert
  with check (
    current_profile_id() = follows.from_id
    and follows.from_id <> follows.to_id
    and not exists (
      select 1 from blocks
      where (blocks.from_id = follows.from_id and blocks.to_id = follows.to_id)
         or (blocks.from_id = follows.to_id and blocks.to_id = follows.from_id)
    )
    and not exists (
      select 1 from profiles p
      where p.id in (follows.from_id, follows.to_id)
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id in (follows.from_id, follows.to_id)
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id in (follows.from_id, follows.to_id)
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. "favorites"
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'favorites' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.favorites', pol.policyname);
  end loop;

  create policy "Un utilisateur ajoute ses propres favoris"
  on favorites for insert
  with check (
    auth.uid() = (select user_id from profiles where id = favorites.from_id)
    and not exists (
      select 1 from blocks
      where (blocks.from_id = favorites.from_id and blocks.to_id = favorites.to_id)
         or (blocks.from_id = favorites.to_id and blocks.to_id = favorites.from_id)
    )
    and not exists (
      select 1 from profiles p
      where p.id in (favorites.from_id, favorites.to_id)
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id in (favorites.from_id, favorites.to_id)
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id in (favorites.from_id, favorites.to_id)
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. "messages" — même check ajouté à l'intérieur de la clause qui porte
-- déjà sur "other_id" (l'autre personne de la conversation), à côté des
-- contrôles de blocage, banni/suspendu et onboarding incomplet existants.
-- VOIR LA NUANCE CI-DESSUS : ce bloc coupe aussi l'envoi de nouveaux
-- messages dans une conversation déjà matchée avant la demande de
-- suppression, dès que l'un des deux comptes est en attente de suppression
-- — à retirer avant exécution si ce n'est pas le comportement voulu.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'messages' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.messages', pol.policyname);
  end loop;

  create policy "Un utilisateur envoie seulement dans une conversation matchee"
  on messages for insert
  with check (
    auth.uid() = (select user_id from profiles where id = messages.from_id)
    and array_length(string_to_array(messages.match_key, '__'), 1) = 2
    and (select id from profiles where user_id = auth.uid())::text
      = any (string_to_array(messages.match_key, '__'))
    and exists (
      select 1
      from unnest(string_to_array(messages.match_key, '__')) as other_id
      where other_id::uuid <> messages.from_id
        and exists (select 1 from likes where from_id = messages.from_id and to_id = other_id::uuid)
        and exists (select 1 from likes where from_id = other_id::uuid and to_id = messages.from_id)
        and not exists (
          select 1 from blocks
          where (blocks.from_id = messages.from_id and blocks.to_id = other_id::uuid)
             or (blocks.from_id = other_id::uuid and blocks.to_id = messages.from_id)
        )
        and not exists (
          select 1 from profiles p
          where p.id in (messages.from_id, other_id::uuid)
            and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
        )
        and not exists (
          select 1 from profiles p
          where p.id in (messages.from_id, other_id::uuid)
            and p.onboarding_completed_at is null
        )
        and not exists (
          select 1 from profiles p
          where p.id in (messages.from_id, other_id::uuid)
            and p.deletion_requested_at is not null
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 5. "event_invitations"
-- ----------------------------------------------------------------------------
drop policy if exists "Inviter en son propre nom si participant et connexion reelle" on event_invitations;
create policy "Inviter en son propre nom si participant et connexion reelle"
on event_invitations for insert
with check (
  invited_by = current_profile_id()
  and not exists (select 1 from events e where e.id = event_id and e.canceled_at is not null)
  and (is_event_participant(event_id) or is_event_mod(event_id))
  and not exists (
    select 1 from blocks
    where (blocks.from_id = current_profile_id() and blocks.to_id = invited_profile_id)
       or (blocks.from_id = invited_profile_id and blocks.to_id = current_profile_id())
  )
  and not exists (
    select 1 from profiles p
    where p.id in (current_profile_id(), invited_profile_id)
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
  and not exists (
    select 1 from profiles p
    where p.id in (current_profile_id(), invited_profile_id)
      and p.onboarding_completed_at is null
  )
  and not exists (
    select 1 from profiles p
    where p.id in (current_profile_id(), invited_profile_id)
      and p.deletion_requested_at is not null
  )
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
-- select policyname, cmd, pg_get_expr(polwithcheck, polrelid)
-- from pg_policies join pg_policy on pg_policy.polname = pg_policies.policyname
-- where schemaname = 'public' and tablename in ('likes','follows','favorites','messages','event_invitations') and cmd = 'INSERT';
-- ============================================================================
