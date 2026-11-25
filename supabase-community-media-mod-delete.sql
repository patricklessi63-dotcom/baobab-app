-- ============================================================================
-- SQL-43 — Médias de communauté : un modérateur peut supprimer le fichier de la
-- publication qu'il supprime (fin des fichiers orphelins)
-- ============================================================================
-- Défaut (audit du 25 novembre 2026) : la policy DELETE de community_posts autorise
-- l'auteur OU un modérateur de la communauté (is_community_mod, supabase-communities.sql),
-- mais la policy Storage du bucket privé "community-media" n'autorise que le
-- propriétaire du fichier (owner = auth.uid(), supabase-communities-3.sql). Quand un
-- modérateur supprime la publication de quelqu'un d'autre, la ligne disparaît mais le
-- client ne peut pas supprimer la photo/vidéo : l'appel échoue en silence
-- (cleanupCommunityMediaUrl, CommunitiesTab.jsx) et le fichier reste pour toujours
-- dans le bucket (stockage payé, et contenu modéré qui subsiste).
--
-- Correctif : la policy DELETE accepte le propriétaire OU un modérateur
-- (owner/admin/moderator) de la communauté dont le dossier porte l'identifiant —
-- exactement les personnes qui peuvent déjà supprimer la publication elle-même.
-- Le CASE garantit qu'un nom de dossier qui ne serait pas un UUID ne provoque jamais
-- d'erreur de conversion (il renvoie simplement « non »).
--
-- Additif et réversible : une seule policy remplacée (retour arrière en bas du fichier).
-- Prérequis : supabase-communities.sql (is_community_mod) et supabase-communities-3.sql
-- (bucket et policies "community-media:%"), tous deux exécutés en production.
-- Idempotent : rejouable sans effet de bord.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.is_community_mod(uuid)') is null then
    raise exception 'SQL-43 : is_community_mod(uuid) absente — exécuter supabase-communities.sql d''abord';
  end if;
  if not exists (select 1 from storage.buckets where id = 'community-media') then
    raise exception 'SQL-43 : bucket community-media absent — exécuter supabase-communities-3.sql d''abord';
  end if;
end $$;

drop policy if exists "community-media: supprime ses propres fichiers" on storage.objects;
drop policy if exists "community-media: auteur ou moderateur supprime" on storage.objects;

create policy "community-media: auteur ou moderateur supprime"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'community-media'
  and (
    owner = auth.uid()
    or case
         when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then coalesce(public.is_community_mod(((storage.foldername(name))[1])::uuid), false)
         else false
       end
  )
);

-- ----------------------------------------------------------------------------
-- Vérifications (lecture seule) après exécution :
-- select policyname, cmd from pg_policies
--  where schemaname = 'storage' and tablename = 'objects' and policyname like 'community-media:%'
--  order by policyname;
--   attendu : « auteur ou moderateur supprime » (DELETE), « lit selon la visibilite… » (SELECT),
--             « televerse en tant que membre » (INSERT) ; plus aucune « supprime ses propres fichiers ».
--
-- Fichiers déjà orphelins (lecture seule, à nettoyer ensuite par l'API Storage, jamais par DELETE SQL) :
-- select o.name from storage.objects o
--  where o.bucket_id = 'community-media'
--    and not exists (select 1 from public.community_posts p where p.media_url like '%/community-media/' || o.name || '%');
-- ----------------------------------------------------------------------------
-- Retour arrière (rétablit exactement la policy d'origine de supabase-communities-3.sql) :
-- drop policy if exists "community-media: auteur ou moderateur supprime" on storage.objects;
-- create policy "community-media: supprime ses propres fichiers"
--   on storage.objects for delete
--   using (bucket_id = 'community-media' and owner = auth.uid());
-- ============================================================================
