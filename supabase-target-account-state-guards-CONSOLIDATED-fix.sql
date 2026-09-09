-- ============================================================================
-- CORRECTIF CONSOLIDÉ — remplace, dans cet ordre exact d'application logique,
-- supabase-block-bypass-fix.sql + supabase-banned-target-action-fix.sql +
-- supabase-onboarding-incomplete-target-action-fix.sql +
-- supabase-deletion-pending-target-action-fix.sql pour les policies INSERT de
-- likes / follows / favorites / messages / event_invitations.
--
-- BUG TROUVÉ (audit de régression, 2026-09-09) : les trois fichiers
-- "*-target-action-fix.sql" (commits c4fe934, 915df69, a2b120a) sont chacun
-- BIEN conçus en interne — chaque fichier redéfinit la policy en entier avec
-- l'ENSEMBLE CUMULÉ des conditions des fichiers précédents (blocage + banni/
-- suspendu + onboarding incomplet + suppression en attente), pas seulement
-- sa propre condition ajoutée. Exécutés seuls, dans n'importe quel ordre,
-- ils ne se marchent donc PAS dessus entre eux.
--
-- Le problème est ailleurs : dans supabase-COMBINED-pending-fixes.sql, la
-- section "SOURCE : supabase-block-bypass-fix.sql" (fix plus ANCIEN,
-- commit 5756068 du 2026-09-03, qui ne connaît que la condition de blocage)
-- a été concaténée APRÈS les trois fixes plus récents (2026-09-04), alors
-- que son contenu est un sous-ensemble strict du leur. Ce fichier fait lui
-- aussi un "drop policy + create policy" sur likes/follows/favorites/
-- event_invitations (mais jamais sur messages, qui avait déjà son check de
-- blocage via supabase-scale-security.sql et n'est pas touché par ce
-- fichier). Résultat : exécuter supabase-COMBINED-pending-fixes.sql de haut
-- en bas sur une base fraîche redéfinit CES 4 TABLES une quatrième fois,
-- en dernier, avec SEULEMENT la condition de blocage — effaçant purement et
-- simplement les gardes banni/suspendu, onboarding incomplet et suppression
-- en attente qui venaient d'être posées juste avant pour ces 4 tables.
-- Seule "messages" ressort intacte avec les 4 conditions cumulées, car
-- supabase-block-bypass-fix.sql ne la redéfinit jamais.
--
-- IMPACT : quiconque exécute le script consolidé tel quel se retrouve avec
-- une protection RÉELLE (au niveau base, contournable par appel API direct)
-- uniquement sur "messages" ; sur likes/follows/favorites/event_invitations,
-- un compte banni/suspendu, un profil n'ayant jamais terminé l'onboarding,
-- ou un compte en attente de suppression peut de nouveau émettre/recevoir
-- ces actions dirigées — exactement le trou que les 3 fixes visaient à
-- combler, silencieusement rouvert par l'ordre de concaténation.
--
-- CORRECTIF : ce fichier redéfinit une bonne fois pour toutes, pour les 5
-- tables, la policy INSERT avec LES 4 CONDITIONS À LA FOIS (blocage OR
-- banni/suspendu OR onboarding incomplet OR suppression en attente — chaque
-- "not exists" est indépendant, donc en pratique un ET logique entre les 4
-- gardes). Idempotent (drop + create), sans risque de régression pour un
-- compte en règle. À exécuter :
--   - après le script consolidé complet (pour corriger l'état final), ou
--   - seul, sur une base qui a déjà reçu un sous-ensemble quelconque des
--     4 fichiers ci-dessus, dans n'importe quel ordre — le résultat final
--     est toujours le même jeu de conditions complet.
--
-- Les 4 fichiers suivants sont donc SUPERSEDED par celui-ci pour la partie
-- policies RLS de likes/follows/favorites/messages/event_invitations :
--   - supabase-block-bypass-fix.sql
--   - supabase-banned-target-action-fix.sql
--   - supabase-onboarding-incomplete-target-action-fix.sql
--   - supabase-deletion-pending-target-action-fix.sql
-- (voir la note ajoutée en tête de chacun). Le reste de leur contenu
-- (commentaires d'audit, contexte) reste valable et n'est pas dupliqué ici.
--
-- NUANCE CONSERVÉE TELLE QUELLE (héritée de deletion-pending-target-action-
-- fix.sql, non tranchée par cet audit) : le bloc "messages" coupe aussi
-- l'envoi de nouveaux messages dans une conversation déjà matchée AVANT une
-- demande de suppression, dès qu'un des deux comptes est en attente de
-- suppression — à retirer de la section 4 ci-dessous si ce n'est pas le
-- comportement voulu par l'équipe.
--
-- IMPORTANT : fichier fourni pour revue/exécution manuelle par l'équipe.
-- Non exécuté automatiquement (règle de sécurité de cet audit). Jamais
-- exécuté contre la base de production par cette session.
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
-- 4. "messages" — même check ajouté à l'intérieur de la clause qui porte déjà
-- sur "other_id" (l'autre personne de la conversation), à côté du contrôle de
-- blocage existant. Voir la NUANCE en tête de fichier pour la portée exacte
-- du bloc suppression-en-attente sur les conversations déjà matchées.
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
-- Vérification (facultatif, à exécuter séparément après) — les 5 policies
-- doivent chacune contenir "blocks", "banned_at", "onboarding_completed_at"
-- ET "deletion_requested_at" dans leur "with check" :
-- select tablename, policyname, pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('likes','follows','favorites','messages','event_invitations')
--   and cmd = 'a';
-- ============================================================================
