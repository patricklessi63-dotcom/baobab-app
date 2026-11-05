-- ============================================================================
-- SQL-36 — Blocage effectif sur les commentaires, « j'aime » et invitations (6 tables).
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 5 novembre 2026 à partir d'un relevé en LECTURE SEULE des policies de production.
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
-- CORRECTIF (additif : aucune policy existante modifiée ou supprimée, aucune RLS désactivée) : une policy
-- RESTRICTIVE INSERT par table (s'ajoute, en ET logique, à la policy permissive existante) qui utilise
-- public.is_blocked_pair(a, b) — fonction SECURITY DEFINER de SQL-25, qui lit « blocks » sans RLS et ne
-- répond que si l'appelant est l'une des deux personnes (pas d'oracle sur les blocages des autres) :
--   post_comments        : (commentateur, auteur de la publication)
--   post_likes           : (personne qui aime, auteur de la publication)
--   community_comments   : (commentateur, auteur de la publication de communauté)
--   community_post_likes : (personne qui aime, auteur de la publication de communauté)
--   event_comments       : (commentateur, organisateur de l'événement : events.created_by)
--   community_invites    : (membre du staff, personne invitée)
-- Une cible introuvable (publication supprimée…) donne « non bloqué » : les autres policies décident.
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
--   -- attendu : les 6 nouvelles lignes ci-dessous + celles de SQL-25 (messages, message_reactions, likes,
--   --           follows, favorites, event_invitations), toutes avec polpermissive = false.
--
-- RETOUR ARRIÈRE :
--   drop policy if exists "post_comments_block_enforcement_insert" on public.post_comments;
--   drop policy if exists "post_likes_block_enforcement_insert" on public.post_likes;
--   drop policy if exists "community_comments_block_enforcement_insert" on public.community_comments;
--   drop policy if exists "community_post_likes_block_enforcement_insert" on public.community_post_likes;
--   drop policy if exists "event_comments_block_enforcement_insert" on public.event_comments;
--   drop policy if exists "community_invites_block_enforcement_insert" on public.community_invites;
-- ============================================================================

do $$
begin
  if to_regprocedure('public.is_blocked_pair(uuid,uuid)') is null then
    raise exception 'is_blocked_pair() introuvable : exécuter d''abord SQL-25 (supabase-block-enforcement-messages-fix.sql)';
  end if;
end $$;

drop policy if exists "post_comments_block_enforcement_insert" on public.post_comments;
create policy "post_comments_block_enforcement_insert" on public.post_comments
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(
    author_id,
    (select p.author_id from public.posts p where p.id = post_comments.post_id)));

drop policy if exists "post_likes_block_enforcement_insert" on public.post_likes;
create policy "post_likes_block_enforcement_insert" on public.post_likes
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(
    profile_id,
    (select p.author_id from public.posts p where p.id = post_likes.post_id)));

drop policy if exists "community_comments_block_enforcement_insert" on public.community_comments;
create policy "community_comments_block_enforcement_insert" on public.community_comments
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(
    author_id,
    (select cp.author_id from public.community_posts cp where cp.id = community_comments.post_id)));

drop policy if exists "community_post_likes_block_enforcement_insert" on public.community_post_likes;
create policy "community_post_likes_block_enforcement_insert" on public.community_post_likes
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(
    profile_id,
    (select cp.author_id from public.community_posts cp where cp.id = community_post_likes.post_id)));

drop policy if exists "event_comments_block_enforcement_insert" on public.event_comments;
create policy "event_comments_block_enforcement_insert" on public.event_comments
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(
    author_id,
    (select e.created_by from public.events e where e.id = event_comments.event_id)));

drop policy if exists "community_invites_block_enforcement_insert" on public.community_invites;
create policy "community_invites_block_enforcement_insert" on public.community_invites
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(invited_by, invited_profile_id));
