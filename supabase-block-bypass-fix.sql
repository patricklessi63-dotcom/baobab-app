-- ============================================================================
-- Correctif — contournement du blocage via likes / follows / favorites /
-- invitations d'événement.
--
-- CONTEXTE : la policy INSERT de "messages" (supabase-scale-security.sql)
-- vérifie déjà qu'aucun blocage n'existe entre les deux profils dans un sens
-- ou l'autre avant d'autoriser l'envoi. Mais en croisant ce même pattern sur
-- les tables sœurs qui créent aussi une interaction dirigée vers une autre
-- personne (likes, follows, favorites, event_invitations), AUCUNE d'elles ne
-- fait ce contrôle : leur policy INSERT vérifie seulement que l'auteur agit
-- en son propre nom (auth.uid() = ... from_id), jamais l'absence de blocage.
--
-- IMPACT CONCRET : le filtrage "blockedIds" dans l'app (SocialShell.jsx,
-- App.jsx, matchingService.js) est fait CÔTÉ CLIENT — il masque les profils
-- bloqués dans les listes affichées, mais ne protège en rien contre un appel
-- direct à l'API Supabase (fetch/Postgrest) avec un to_id/invited_profile_id
-- arbitraire. Concrètement, une personne qui vient d'être bloquée par sa
-- victime peut TOUJOURS, par ce chemin détourné :
--   - la liker à nouveau (table "likes"),
--   - s'abonner à elle (table "follows", ce qui déclenche une notification
--     "new_follower" — donc un contact indirect malgré le blocage),
--   - l'ajouter à ses favoris (table "favorites"),
--   - l'inviter à un événement si un like mutuel existait avant le blocage,
--     ou si les deux sont membres de la même communauté (table
--     "event_invitations" — déclenche aussi une notification "event_invite").
--
-- CORRECTIF : réplique exactement le garde-fou "not exists (select 1 from
-- blocks where ...)" déjà utilisé pour "messages" sur ces 4 tables. Additif
-- et sans risque de régression : un utilisateur non bloqué n'est jamais
-- affecté, la condition n'ajoute qu'un NOT EXISTS supplémentaire aux checks
-- déjà en place.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "likes" — un blocage (dans un sens ou l'autre) empêche désormais tout
-- nouveau like entre les deux profils.
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 2. "follows" — idem : impossible de s'abonner à quelqu'un avec qui un
-- blocage existe (dans un sens ou l'autre).
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. "favorites" — idem.
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. "event_invitations" — un like mutuel antérieur au blocage (branche
-- "connexion réelle") ou une appartenance commune à une communauté (branche
-- communautaire) restaient tous deux exploitables après blocage. Ajout du
-- même garde-fou sur les deux branches du OR existant.
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
-- select policyname, cmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('likes','follows','favorites','event_invitations');
-- ============================================================================
