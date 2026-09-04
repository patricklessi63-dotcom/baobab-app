-- ============================================================================
-- Correctif — un compte banni ou suspendu peut encore RECEVOIR (et ENVOYER)
-- des actions dirigées via l'API, sans aucun contrôle côté base.
--
-- CONTEXTE : l'admin peut bannir/suspendre un profil (profiles.banned_at /
-- profiles.suspended_until, voir supabase-admin.sql). Côté client, cet état
-- est bien vérifié pour SON PROPRE compte (App.jsx, vue "banned"/"suspended"
-- qui remplace tout l'écran) et, depuis peu, affiché comme indication dans
-- une conversation déjà ouverte avec un tiers banni/suspendu (voir
-- ConversationPane.jsx / MessagesTab.jsx). Mais ce sont des gardes CÔTÉ
-- CLIENT uniquement.
--
-- En auditant les policies RLS d'INSERT des tables qui créent une
-- interaction dirigée vers un autre profil (likes, follows, favorites,
-- messages, event_invitations), AUCUNE ne consulte banned_at/suspended_until
-- — ni pour l'auteur de l'action, ni pour sa cible. Concrètement, par un
-- appel direct à l'API Supabase (fetch/PostgREST, hors UI) :
--   - un compte banni/suspendu peut continuer à liker, suivre, mettre en
--     favori, écrire ou inviter, malgré l'écran de blocage côté client ;
--   - n'IMPORTE QUEL compte (même normal, via l'UI standard : Découverte,
--     recherche globale, favoris, abonnés/abonnements, membres d'une
--     communauté, participants d'un événement — aucun de ces écrans ne
--     filtre les profils bannis/suspendus) peut encore liker, suivre, mettre
--     en favori, écrire ou inviter un profil qui vient d'être banni ou
--     suspendu, puisque rien ne l'interdit côté serveur.
--
-- CORRECTIF : réplique le même garde-fou "not exists (...)" déjà utilisé
-- pour les blocages (supabase-block-bypass-fix.sql) sur ces mêmes tables,
-- cette fois pour interdire toute nouvelle interaction dès que L'UN DES DEUX
-- profils (auteur ou cible) est banni, ou suspendu avec une suspension
-- encore active (suspended_until > now()). Additif et sans risque de
-- régression pour les comptes en règle : la condition n'ajoute qu'un NOT
-- EXISTS supplémentaire aux checks déjà en place (repris tels quels).
--
-- Portée volontairement limitée aux interactions à SENS UNIQUE vers un autre
-- profil. "community_members" (rejoindre une communauté publique) n'a pas de
-- profil cible distinct — seul l'auteur agit pour lui-même, déjà couvert par
-- l'écran client "banned"/"suspended" — et n'est donc pas touché ici.
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. "messages" — même check ajouté à l'intérieur de la clause qui porte
-- déjà sur "other_id" (l'autre personne de la conversation), à côté du
-- contrôle de blocage existant.
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
