-- ============================================================================
-- Nettoyage des données de test avant mise en production (Phase 10, section 38)
-- ============================================================================
-- IMPORTANT — à exécuter en DEUX temps, jamais en un seul bloc :
--   1. La requête SELECT ci-dessous liste TOUS les comptes existants avec de
--      quoi les identifier (email, nom, date de création, volume de contenu).
--      Regarde le résultat et note précisément les UUID des comptes de TEST
--      (pas les vrais comptes bêta-testeurs déjà invités).
--   2. Colle ces UUID dans le bloc DELETE tout en bas, décommente-le, et
--      exécute-le seulement après avoir vérifié la liste.
--
-- Je n'ai pas d'accès direct à ta base — je ne peux donc pas savoir moi-même
-- lesquels de tes comptes sont des tests. NE JAMAIS deviner : vérifie
-- toujours le résultat de l'étape 1 avant de toucher à l'étape 2.
--
-- Grâce aux contraintes "on delete cascade" déjà en place sur toutes les
-- tables (profiles, posts, messages, likes, follows, communities, events,
-- notifications, etc. — vérifié dans chaque migration), supprimer la ligne
-- auth.users suffit : tout le contenu associé au profil disparaît en cascade,
-- automatiquement, dans le bon ordre. Les fichiers Storage (photos, médias)
-- ne suivent PAS ce mécanisme (ce ne sont pas des lignes liées par clé
-- étrangère) — l'étape 3 les nettoie séparément.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ÉTAPE 1 — identification : liste tous les comptes avec leur volume de
-- contenu, pour repérer les comptes de test au premier coup d'œil.
-- ----------------------------------------------------------------------------
select
  p.id as profile_id,
  p.user_id,
  u.email,
  p.name,
  p.created_at,
  (select count(*) from posts where author_id = p.id) as nb_posts,
  (select count(*) from messages where from_id = p.id) as nb_messages,
  (select count(*) from community_members where profile_id = p.id) as nb_communautes,
  (select count(*) from likes where from_id = p.id) as nb_likes_envoyes,
  exists(select 1 from beta_testers where lower(email) = lower(u.email)) as est_beta_testeur_invite
from profiles p
join auth.users u on u.id = p.user_id
order by p.created_at asc;

-- ----------------------------------------------------------------------------
-- ÉTAPE 2 — vérifications de sécurité avant toute suppression.
-- ----------------------------------------------------------------------------
-- NE JAMAIS supprimer TON PROPRE compte (le tien, Patrick Lessi).
--
-- Repère les vrais comptes bêta ("est_beta_testeur_invite" = true) : ce sont
-- des personnes réelles qui ont accepté une invitation — à ne supprimer que
-- si elles t'ont explicitement demandé de fermer leur compte.

-- ----------------------------------------------------------------------------
-- ÉTAPE 3 — nettoyage Storage (photos/médias) des comptes identifiés.
-- Deux formes de chemin selon le bucket : "avatars"/"stories" utilisent
-- {user_id}/fichier ; "community-media"/"event-media" utilisent
-- {profile_id}/fichier ; "chat-media" utilise {idA__idB}/fichier (les deux
-- profile_id de la conversation combinés) — d'où le "like" plutôt qu'une
-- égalité stricte pour ce bucket. Remplace les UUID ci-dessous par ceux
-- validés à l'étape 1, puis décommente.
-- ----------------------------------------------------------------------------
-- delete from storage.objects
-- where (
--   (bucket_id in ('avatars', 'community-media', 'event-media')
--     and (storage.foldername(name))[1] = any (array[
--       'UUID_USER_ID_1', 'UUID_PROFILE_ID_1'
--       -- ajoute chaque user_id ET profile_id concerné, un par ligne
--     ]))
--   or (bucket_id = 'chat-media'
--     and (storage.foldername(name))[1] like any (array[
--       '%UUID_PROFILE_ID_1%'
--       -- un profile_id par ligne, avec % de part et d'autre
--     ]))
-- );

-- ----------------------------------------------------------------------------
-- ÉTAPE 4 — suppression des comptes (cascade sur tout le reste de la base).
-- Remplace la liste d'UUID ci-dessous par celle validée à l'étape 1
-- (colonne user_id, PAS profile_id), puis décommente.
-- ----------------------------------------------------------------------------
-- delete from auth.users
-- where id in (
--   'UUID_USER_ID_1',
--   'UUID_USER_ID_2'
--   -- un user_id par ligne, uniquement ceux vérifiés à l'étape 1
-- );

-- ----------------------------------------------------------------------------
-- ÉTAPE 5 — vérification post-nettoyage (à exécuter après l'étape 4).
-- ----------------------------------------------------------------------------
-- select count(*) as profils_restants from profiles;
-- select p.id, p.name, u.email from profiles p join auth.users u on u.id = p.user_id order by p.created_at asc;
-- select count(*) as fichiers_orphelins from storage.objects
--   where bucket_id in ('avatars','chat-media','community-media','event-media')
--   and (storage.foldername(name))[1] not in (select id::text from profiles union select user_id::text from profiles);
-- ============================================================================
