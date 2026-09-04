-- ============================================================================
-- Correctif — un compte n'ayant jamais terminé l'onboarding peut encore
-- ENVOYER (et RECEVOIR) des actions dirigées via l'API, sans aucun contrôle
-- côté base. Même principe que supabase-banned-target-action-fix.sql,
-- généralisé à onboarding_completed_at.
--
-- CONTEXTE : OnboardingWizard.jsx (src/screens/onboarding/OnboardingWizard.jsx)
-- crée la ligne "profiles" dès l'étape 1/10 (usage_goals + onboarding_step
-- seulement — pas encore de nom, d'âge, de photo ni d'aucune préférence) et
-- ne pose onboarding_completed_at qu'à l'étape 10/10. dating_enabled vaut
-- true par défaut (supabase-dating-2.sql). Le client vient d'être corrigé
-- (candidates, App.jsx) pour ne plus proposer ces profils "en cours
-- d'inscription" dans Découverte — mais c'est un garde CÔTÉ CLIENT
-- uniquement.
--
-- En auditant les mêmes policies RLS d'INSERT que pour le correctif
-- banned/suspended (likes, follows, favorites, messages, event_invitations),
-- AUCUNE ne consulte onboarding_completed_at — ni pour l'auteur de l'action,
-- ni pour sa cible. Concrètement, par un appel direct à l'API Supabase
-- (fetch/PostgREST, hors UI) :
--   - un compte qui vient tout juste de créer sa ligne profils à l'étape 1
--     (avant même d'avoir choisi un nom) peut déjà liker, suivre, mettre en
--     favori, écrire ou inviter quelqu'un d'autre ;
--   - n'IMPORTE QUEL compte peut encore liker, suivre, mettre en favori,
--     écrire ou inviter un profil qui n'a jamais terminé son inscription
--     (abandon en cours de route, ou simplement pas encore rendu au bout) —
--     une personne qui n'a jamais vu ni confirmé l'écran final de
--     l'onboarding, ni choisi ses propres préférences (pref_age_min/max,
--     distance, dating_enabled...), peut donc recevoir un like/message/
--     favori/invitation en toute légitimité API, malgré l'écran "Découverte"
--     qui ne la propose plus à personne depuis le correctif client.
--
-- CORRECTIF : réplique le garde-fou "not exists (...)" déjà utilisé pour les
-- blocages (supabase-block-bypass-fix.sql) et pour banned/suspended
-- (supabase-banned-target-action-fix.sql) sur ces mêmes tables, cette fois
-- pour interdire toute nouvelle interaction dès que L'UN DES DEUX profils
-- (auteur ou cible) n'a pas encore onboarding_completed_at renseigné.
-- Additif et sans risque de régression pour les comptes ayant terminé leur
-- inscription : la condition n'ajoute qu'un NOT EXISTS supplémentaire aux
-- checks déjà en place (repris tels quels, y compris ceux du correctif
-- banned/suspended). Fichier conçu pour être exécuté indépendamment de
-- l'ordre d'exécution avec supabase-banned-target-action-fix.sql — chaque
-- policy est redéfinie en entier, avec l'ensemble cumulé des conditions
-- (blocage + banni/suspendu + onboarding), pas seulement l'ajout.
--
-- Portée volontairement limitée aux interactions à SENS UNIQUE vers un autre
-- profil, comme pour le correctif banned/suspended. "community_members"
-- (rejoindre une communauté publique) n'a pas de profil cible distinct et
-- n'est donc pas touché ici.
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. "messages" — même check ajouté à l'intérieur de la clause qui porte
-- déjà sur "other_id" (l'autre personne de la conversation), à côté des
-- contrôles de blocage et de banni/suspendu existants.
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
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('likes','follows','favorites','messages','event_invitations')
--   and cmd = 'a';
-- ============================================================================
