-- ============================================================================
-- CORRECTIF — même méthode que supabase-posts-account-state-guard-fix.sql
-- (commits 4debb4d/12565e6) et supabase-post-likes-comments-block-fix.sql
-- (audit "posts"/"post_media"/"post_likes"/"post_comments"), appliquée
-- exhaustivement à TOUT LE RESTE du contenu généré par les utilisateurs qui
-- n'avait pas encore été passé au crible : communautés (community_posts/
-- community_post_likes/community_comments), événements (event_comments),
-- statuts (story_reactions/story_views) et messagerie (message_reactions).
--
-- MÉTHODE (identique aux 2 fichiers cités) : pour chaque table, deux gardes
-- indépendants sur la policy INSERT :
--   (a) état de compte de l'ACTEUR (banni/suspendu, onboarding incomplet,
--       suppression en attente) — s'applique TOUJOURS à l'acteur ;
--   (b) blocage entre l'acteur et l'auteur/organisateur CIBLÉ — seulement
--       quand la table a un destinataire distinct identifiable (liker/
--       commenter le contenu de quelqu'un d'autre), pas quand l'acteur agit
--       sur son propre contenu (créer un post/statut ne cible personne).
--
-- AUDIT (grep exhaustif de "for insert" sur tous les supabase-*.sql,
-- résolu à la DERNIÈRE définition de chaque policy si plusieurs fichiers la
-- redéfinissent — confirmé qu'aucun des fichiers ci-dessous n'a jamais été
-- réécrit après sa création initiale) :
--
-- Table                  | (a) état de compte | (b) blocage           | Verdict
-- -----------------------|---------------------|------------------------|--------
-- community_posts        | absent              | s/o (pas de cible)     | à corriger (a)
-- community_post_likes   | absent              | absent (cible = auteur | à corriger (a)+(b)
--                         |                     | du post via post_id)   |
-- community_comments     | absent              | absent (idem, via      | à corriger (a)+(b)
--                         |                     | post_id -> author_id)  |
-- event_comments          | absent              | absent (cible =        | à corriger (a)+(b)
--                         |                     | events.created_by via  |
--                         |                     | event_id)              |
-- story_reactions         | absent              | DÉJÀ COUVERT           | à corriger (a) seul
--                         |                     | indirectement (voir    |
--                         |                     | note ci-dessous)       |
-- story_views              | absent              | DÉJÀ COUVERT           | à corriger (a) seul
--                         |                     | indirectement (idem)   |
-- message_reactions        | absent              | absent (cible = l'autre| à corriger (a)+(b)
--                         |                     | partie de match_key)   |
--
-- NOTE story_reactions/story_views — le blocage est déjà appliqué, mais PAS
-- par la policy INSERT elle-même : le "exists (select 1 from stories s
-- where s.id = ...)" de ces deux policies s'exécute sous les droits de
-- l'appelant et est donc filtré par la policy SELECT de "stories"
-- (supabase-stories-expiration.sql), qui exclut déjà explicitement les
-- statuts d'un profil bloqué/bloquant ("not exists (select 1 from blocks
-- b where ...)"). Documenté dans le commentaire d'origine de
-- supabase-stories-2.sql ligne ~38 ("L'insertion passe par la RLS SELECT de
-- stories elle-meme [...] impossible de marquer 'vu' un statut qu'on n'a
-- pas le droit de voir"). Vérifié correct — dupliquer le garde de blocage
-- ici serait redondant, pas un vrai trou. Ce raisonnement NE s'applique PAS
-- à "posts" (policy SELECT en "using (true)", documenté et volontaire dans
-- supabase-post-likes-comments-block-fix.sql), ni à "community_posts" (SELECT
-- conditionnée uniquement à la visibilité de la communauté, jamais au
-- blocage) ni à "messages" (SELECT conditionnée uniquement à l'appartenance
-- au match_key, jamais au blocage) — d'où le garde explicite ajouté plus
-- bas pour community_post_likes/community_comments/event_comments/
-- message_reactions.
--
-- IMPACT CONCRET (avant correctif) :
--   - un compte banni/suspendu/onboarding incomplet/suppression en attente
--     peut toujours créer un post de communauté, liker/commenter un post de
--     communauté, commenter un événement, ou réagir à un message, par appel
--     direct à l'API PostgREST ;
--   - un utilisateur ayant bloqué (ou étant bloqué par) l'auteur d'un post
--     de communauté peut toujours le liker/commenter ;
--   - un utilisateur ayant bloqué (ou étant bloqué par) l'organisateur d'un
--     événement peut toujours commenter cet événement ;
--   - un utilisateur ayant bloqué (ou étant bloqué par) l'autre participant
--     d'une conversation peut toujours réagir à ses messages — alors que
--     l'envoi d'un NOUVEAU message est déjà bloqué depuis
--     supabase-target-account-state-guards-CONSOLIDATED-fix.sql.
--
-- HORS PÉRIMÈTRE (repéré en cours de route, volontairement NON corrigé ici
-- pour rester strictement dans le périmètre de cette passe — à traiter dans
-- un futur audit dédié) : "reports"/"community_reports"/"event_reports" ont
-- aussi un destinataire ciblé (from_id -> profil signalé) sans garde de
-- blocage, mais le blocage ne devrait probablement PAS empêcher un
-- signalement (choix de produit à trancher, pas un bug RLS) ; "community_
-- invites" a un destinataire distinct mais est réservée au staff
-- (is_community_staff), catégorie modération plutôt que contenu généré par
-- un utilisateur ordinaire, donc hors du périmètre défini pour cette passe.
--
-- Idempotent (drop + create). Sans risque de régression pour un compte en
-- règle et non bloqué. À exécuter dans Supabase : SQL Editor, après
-- supabase-communities.sql, supabase-events-v2.sql, supabase-stories-2.sql
-- et supabase-messaging-2.sql. Jamais exécuté contre la production par
-- cette session (règle de sécurité de cet audit).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "community_posts" — garde porté sur l'auteur lui-même (pas de
-- destinataire distinct : poster dans une communauté ne cible personne).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'community_posts' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.community_posts', pol.policyname);
  end loop;

  create policy "Un membre poste en son propre nom"
  on community_posts for insert
  to authenticated
  with check (
    author_id = current_profile_id()
    and is_community_member(community_id)
    and not exists (
      select 1 from profiles p
      where p.id = community_posts.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_posts.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_posts.author_id
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 2. "community_post_likes" — garde d'état de compte sur l'acteur + garde de
-- blocage entre l'acteur et l'auteur du post de communauté ciblé.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'community_post_likes' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.community_post_likes', pol.policyname);
  end loop;

  create policy "Liker en son propre nom"
  on community_post_likes for insert
  to authenticated
  with check (
    profile_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = community_post_likes.profile_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_post_likes.profile_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_post_likes.profile_id
        and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from community_posts cp
      where cp.id = community_post_likes.post_id
        and exists (
          select 1 from blocks b
          where (b.from_id = community_post_likes.profile_id and b.to_id = cp.author_id)
             or (b.from_id = cp.author_id and b.to_id = community_post_likes.profile_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. "community_comments" — même garde, entre l'auteur du commentaire et
-- l'auteur du post de communauté commenté.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'community_comments' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.community_comments', pol.policyname);
  end loop;

  create policy "Un membre commente en son propre nom"
  on community_comments for insert
  to authenticated
  with check (
    author_id = current_profile_id()
    and is_community_member((select community_id from community_posts where id = post_id))
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from community_posts cp
      where cp.id = community_comments.post_id
        and exists (
          select 1 from blocks b
          where (b.from_id = community_comments.author_id and b.to_id = cp.author_id)
             or (b.from_id = cp.author_id and b.to_id = community_comments.author_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. "event_comments" — garde d'état de compte sur l'acteur + garde de
-- blocage entre l'acteur et l'organisateur de l'événement (events.created_by).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'event_comments' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.event_comments', pol.policyname);
  end loop;

  create policy "Un participant commente en son propre nom"
  on event_comments for insert
  to authenticated
  with check (
    author_id = current_profile_id()
    and (is_event_participant(event_id) or is_event_mod(event_id))
    and not exists (
      select 1 from profiles p
      where p.id = event_comments.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = event_comments.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = event_comments.author_id
        and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from events e
      where e.id = event_comments.event_id
        and e.created_by is not null
        and exists (
          select 1 from blocks b
          where (b.from_id = event_comments.author_id and b.to_id = e.created_by)
             or (b.from_id = e.created_by and b.to_id = event_comments.author_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 5. "story_reactions" — garde d'état de compte sur l'acteur. Pas de garde
-- de blocage ajouté ici : déjà appliqué indirectement par la policy SELECT
-- de "stories" (voir NOTE en tête de fichier).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'story_reactions' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.story_reactions', pol.policyname);
  end loop;

  create policy "Reagir a un statut visible"
  on story_reactions for insert
  to authenticated
  with check (
    profile_id = current_profile_id()
    and exists (select 1 from stories s where s.id = story_reactions.story_id)
    and not exists (
      select 1 from profiles p
      where p.id = story_reactions.profile_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = story_reactions.profile_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = story_reactions.profile_id
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 6. "story_views" — même garde d'état de compte sur le spectateur. Même
-- note pour le blocage (déjà couvert indirectement).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'story_views' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.story_views', pol.policyname);
  end loop;

  create policy "Marquer un statut visible comme vu"
  on story_views for insert
  to authenticated
  with check (
    viewer_id = current_profile_id()
    and exists (select 1 from stories s where s.id = story_views.story_id)
    and not exists (
      select 1 from profiles p
      where p.id = story_views.viewer_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = story_views.viewer_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = story_views.viewer_id
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 7. "message_reactions" — garde d'état de compte sur l'acteur + garde de
-- blocage entre l'acteur et l'autre participant de la conversation (extrait
-- du match_key du message ciblé, même technique que la policy INSERT de
-- "messages" dans supabase-target-account-state-guards-CONSOLIDATED-fix.sql).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'message_reactions' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.message_reactions', pol.policyname);
  end loop;

  create policy "message_reactions_insert_own"
  on public.message_reactions for insert
  to authenticated
  with check (
    profile_id = (select id from public.profiles where user_id = auth.uid())
    and exists (select 1 from public.messages m where m.id = message_reactions.message_id)
    and not exists (
      select 1 from profiles p
      where p.id = message_reactions.profile_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = message_reactions.profile_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = message_reactions.profile_id
        and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from public.messages m, unnest(string_to_array(m.match_key, '__')) as other_id
      where m.id = message_reactions.message_id
        and other_id::uuid <> message_reactions.profile_id
        and exists (
          select 1 from blocks b
          where (b.from_id = message_reactions.profile_id and b.to_id = other_id::uuid)
             or (b.from_id = other_id::uuid and b.to_id = message_reactions.profile_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) — les 7 policies
-- doivent chacune contenir "banned_at", "onboarding_completed_at" ET
-- "deletion_requested_at" dans leur "with check", et les 5 concernées
-- (community_post_likes, community_comments, event_comments, message_
-- reactions) doivent en plus contenir "blocks" :
-- select tablename, policyname, pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('community_posts','community_post_likes',
--     'community_comments','event_comments','story_reactions','story_views',
--     'message_reactions')
--   and cmd = 'a';
-- ============================================================================
