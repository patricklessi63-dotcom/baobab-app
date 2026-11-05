-- ============================================================================
-- SQL-36 — Blocage effectif sur les commentaires, « j'aime » et invitations (6 tables).
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 5 novembre 2026 à partir d'un relevé en LECTURE SEULE des policies de production, puis corrigé
-- le même jour après l'essai sur le projet de répétition (voir « DEUXIÈME DÉFAUT » ci-dessous).
--
-- CAUSE (la même que SQL-25) : la policy INSERT de chacune de ces tables contient
--   NOT EXISTS (select 1 from blocks where (from = moi and to = lui) or (from = lui and to = moi))
-- mais une sous-requête de policy s'exécute avec les droits de l'APPELANT, donc soumise à la RLS de
-- « blocks » (chacun ne voit que les blocages QU'IL a créés). La personne BLOQUÉE ne voit pas le
-- blocage : pour elle le NOT EXISTS est toujours vrai. Seul le blocage « dans l'autre sens » est
-- réellement appliqué. SQL-25 (exécuté le 4 novembre) a corrigé messages, réactions, likes, follows,
-- favoris, invitations d'événement et photos de conversation, pas ces six tables.
--
-- CONSÉQUENCE AVANT CE FICHIER : via l'API, une personne bloquée par l'auteur peut encore commenter sa
-- publication, aimer sa publication, commenter/aimer dans sa communauté, commenter l'événement qu'il
-- organise, et (staff) l'inviter dans une communauté.
--
-- DEUXIÈME DÉFAUT (trouvé à la répétition) : retrouver l'AUTEUR de la publication par une sous-requête
-- (select author_id from posts …) est lui aussi soumis à la RLS : celui qui a BLOQUÉ l'auteur ne voit plus
-- sa publication (la RLS de lecture de posts la lui cache), la sous-requête renvoie NULL et
-- is_blocked_pair(…, NULL) vaut faux : l'insertion passait. D'où quatre petites fonctions
-- SECURITY DEFINER qui retrouvent la cible SANS RLS et ne renvoient QU'UN BOOLÉEN (jamais l'auteur : pas
-- d'oracle sur une publication que la personne ne peut pas voir).
--
-- CORRECTIF (additif : aucune policy existante modifiée ou supprimée, aucune RLS désactivée) : une policy
-- RESTRICTIVE INSERT par table (s'ajoute, en ET logique, à la policy permissive existante) :
--   post_comments        : (commentateur, auteur de la publication)        is_blocked_with_post_author
--   post_likes           : (personne qui aime, auteur de la publication)   is_blocked_with_post_author
--   community_comments   : (commentateur, auteur de la publication de communauté)  is_blocked_with_community_post_author
--   community_post_likes : (personne qui aime, auteur de la publication de communauté)  is_blocked_with_community_post_author
--   event_comments       : (commentateur, organisateur : events.created_by) is_blocked_with_event_organizer
--   community_invites    : (membre du staff, personne invitée)             is_blocked_pair (direct)
-- Une cible introuvable (publication supprimée, organisateur inconnu…) donne « non bloqué » : les autres
-- policies décident. La fonction is_blocked_with_comment_author (commentaire du fil) est fournie pour que
-- SQL-35 (« j'aime » de commentaires) l'utilise : même mécanisme, même piège.
-- Les lectures (SELECT) ne changent pas, comme dans SQL-25 (contenu du fil visible de tous les connectés).
--
-- PRÉREQUIS : SQL-25 exécuté (is_blocked_pair). Le fichier s'arrête avec un message clair sinon.
--
-- DÉPLOIEMENT : aucun changement de client requis. Un refus remonte comme un rejet RLS (42501) que
-- l'application traduit déjà par « Tu n'as pas la permission d'effectuer cette action » (friendlyDbError).
--
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule) :
--   select polrelid::regclass::text, polname, polpermissive from pg_policy
--   where polname like '%block_enforcement_insert' order by 1;
--   -- attendu : les 6 nouvelles lignes + celles de SQL-25, toutes avec polpermissive = false.
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon
--   from pg_proc p where p.proname like 'is_blocked_with_%';      -- 4 lignes, anon = false
--
-- RETOUR ARRIÈRE :
--   drop policy if exists "post_comments_block_enforcement_insert" on public.post_comments;
--   drop policy if exists "post_likes_block_enforcement_insert" on public.post_likes;
--   drop policy if exists "community_comments_block_enforcement_insert" on public.community_comments;
--   drop policy if exists "community_post_likes_block_enforcement_insert" on public.community_post_likes;
--   drop policy if exists "event_comments_block_enforcement_insert" on public.event_comments;
--   drop policy if exists "community_invites_block_enforcement_insert" on public.community_invites;
--   drop function if exists public.is_blocked_with_post_author(uuid, uuid), public.is_blocked_with_community_post_author(uuid, uuid),
--     public.is_blocked_with_event_organizer(uuid, uuid), public.is_blocked_with_comment_author(uuid, uuid);
-- ============================================================================

do $$
begin
  if to_regprocedure('public.is_blocked_pair(uuid,uuid)') is null then
    raise exception 'is_blocked_pair() introuvable : exécuter d''abord SQL-25 (supabase-block-enforcement-messages-fix.sql)';
  end if;
end $$;

-- Fonctions « cible » : retrouvent l'auteur/organisateur SANS RLS et ne renvoient qu'un booléen. auth.uid()
-- (donc le profil de l'appelant lu par is_blocked_pair) n'est pas modifié par SECURITY DEFINER.
create or replace function public.is_blocked_with_post_author(p_actor uuid, p_post_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_blocked_pair(p_actor, (select p.author_id from public.posts p where p.id = p_post_id));
$$;

create or replace function public.is_blocked_with_community_post_author(p_actor uuid, p_post_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_blocked_pair(p_actor, (select cp.author_id from public.community_posts cp where cp.id = p_post_id));
$$;

create or replace function public.is_blocked_with_event_organizer(p_actor uuid, p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_blocked_pair(p_actor, (select e.created_by from public.events e where e.id = p_event_id));
$$;

create or replace function public.is_blocked_with_comment_author(p_actor uuid, p_comment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_blocked_pair(p_actor, (select c.author_id from public.post_comments c where c.id = p_comment_id));
$$;

revoke all on function
  public.is_blocked_with_post_author(uuid, uuid), public.is_blocked_with_community_post_author(uuid, uuid),
  public.is_blocked_with_event_organizer(uuid, uuid), public.is_blocked_with_comment_author(uuid, uuid)
  from public, anon;
grant execute on function
  public.is_blocked_with_post_author(uuid, uuid), public.is_blocked_with_community_post_author(uuid, uuid),
  public.is_blocked_with_event_organizer(uuid, uuid), public.is_blocked_with_comment_author(uuid, uuid)
  to authenticated;

drop policy if exists "post_comments_block_enforcement_insert" on public.post_comments;
create policy "post_comments_block_enforcement_insert" on public.post_comments
  as restrictive for insert to authenticated
  with check (not public.is_blocked_with_post_author(author_id, post_id));

drop policy if exists "post_likes_block_enforcement_insert" on public.post_likes;
create policy "post_likes_block_enforcement_insert" on public.post_likes
  as restrictive for insert to authenticated
  with check (not public.is_blocked_with_post_author(profile_id, post_id));

drop policy if exists "community_comments_block_enforcement_insert" on public.community_comments;
create policy "community_comments_block_enforcement_insert" on public.community_comments
  as restrictive for insert to authenticated
  with check (not public.is_blocked_with_community_post_author(author_id, post_id));

drop policy if exists "community_post_likes_block_enforcement_insert" on public.community_post_likes;
create policy "community_post_likes_block_enforcement_insert" on public.community_post_likes
  as restrictive for insert to authenticated
  with check (not public.is_blocked_with_community_post_author(profile_id, post_id));

drop policy if exists "event_comments_block_enforcement_insert" on public.event_comments;
create policy "event_comments_block_enforcement_insert" on public.event_comments
  as restrictive for insert to authenticated
  with check (not public.is_blocked_with_event_organizer(author_id, event_id));

drop policy if exists "community_invites_block_enforcement_insert" on public.community_invites;
create policy "community_invites_block_enforcement_insert" on public.community_invites
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(invited_by, invited_profile_id));
