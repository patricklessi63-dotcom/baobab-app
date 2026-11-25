-- ============================================================================
-- SQL-44 — Photos d'événements : l'équipe de l'événement peut supprimer le fichier
-- de la photo qu'elle supprime (fin des fichiers orphelins)
-- ============================================================================
-- Défaut (audit du 25 novembre 2026, même famille que SQL-43) : la policy DELETE de
-- event_media autorise l'auteur de la photo OU l'équipe de l'événement
-- (is_event_mod : organisateur, co-organisateur, modérateur — supabase-events-v2.sql),
-- mais la policy Storage du bucket privé "event-media" n'autorise que le propriétaire
-- du fichier (owner = auth.uid()). Quand l'équipe retire la photo de quelqu'un d'autre,
-- la ligne disparaît de la galerie mais le fichier ne peut pas être supprimé : l'appel
-- échoue en silence (handleDeletePhoto, EventsTab.jsx) et la photo reste pour toujours
-- dans le bucket (stockage payé, et contenu modéré qui subsiste).
--
-- Correctif : la policy DELETE accepte le propriétaire OU l'équipe de l'événement dont
-- le dossier porte l'identifiant — exactement les personnes qui peuvent déjà supprimer
-- la ligne event_media. Réservée aux comptes connectés. Le CASE garantit qu'un nom de
-- dossier qui ne serait pas un UUID ne provoque jamais d'erreur de conversion.
--
-- Additif et réversible : une seule policy remplacée (retour arrière en bas du fichier).
-- Prérequis : supabase-events-v2.sql (is_event_mod, bucket et policies "event-media:%"),
-- exécuté en production. Idempotent : rejouable sans effet de bord.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.is_event_mod(uuid)') is null then
    raise exception 'SQL-44 : is_event_mod(uuid) absente — exécuter supabase-events-v2.sql d''abord';
  end if;
  if not exists (select 1 from storage.buckets where id = 'event-media') then
    raise exception 'SQL-44 : bucket event-media absent — exécuter supabase-events-v2.sql d''abord';
  end if;
end $$;

drop policy if exists "event-media: supprime ses propres fichiers" on storage.objects;
drop policy if exists "event-media: auteur ou equipe supprime" on storage.objects;

create policy "event-media: auteur ou equipe supprime"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'event-media'
  and (
    owner = auth.uid()
    or case
         when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then coalesce(public.is_event_mod(((storage.foldername(name))[1])::uuid), false)
         else false
       end
  )
);

-- ----------------------------------------------------------------------------
-- Vérifications (lecture seule) après exécution :
-- select policyname, cmd, roles from pg_policies
--  where schemaname = 'storage' and tablename = 'objects' and policyname like 'event-media:%'
--  order by policyname;
--   attendu : « auteur ou equipe supprime » (DELETE, {authenticated}), « lit selon visibilite… » (SELECT),
--             « partage une photo si participant » (INSERT) ; plus aucune « supprime ses propres fichiers ».
--
-- Fichiers déjà orphelins (lecture seule, à nettoyer ensuite par l'API Storage, jamais par DELETE SQL) :
-- select o.name from storage.objects o
--  where o.bucket_id = 'event-media'
--    and not exists (select 1 from public.event_media m where m.storage_path = o.name);
-- ----------------------------------------------------------------------------
-- Retour arrière (rétablit exactement la policy d'origine de supabase-events-v2.sql) :
-- drop policy if exists "event-media: auteur ou equipe supprime" on storage.objects;
-- create policy "event-media: supprime ses propres fichiers"
--   on storage.objects for delete
--   using (bucket_id = 'event-media' and owner = auth.uid());
-- ============================================================================
