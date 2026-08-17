-- ============================================================================
-- Phase 5.5 (addendum) — Messagerie riche : bucket Storage privé + RLS.
-- À exécuter dans Supabase : SQL Editor (une fois), APRÈS supabase-messages-media.sql.
-- ============================================================================
-- Nouveau bucket dédié "chat-media" — jamais réutiliser "avatars" (public,
-- déjà utilisé pour les photos de profil et les statuts, périmètre différent).
-- Bucket privé : aucun accès public direct, uniquement via des URLs signées
-- générées côté client une fois la RLS SELECT satisfaite.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media', 'chat-media', false, 52428800, -- 50 Mo, plafond serveur large ;
  -- les plafonds plus stricts par type (image 8 Mo / vidéo 50 Mo / audio 15 Mo /
  -- fichier 20 Mo) sont appliqués côté client avant l'upload (src/lib/mediaConstants.js).
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'audio/webm','audio/mp4','audio/mpeg','audio/ogg',
    'application/pdf','application/zip','text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Convention de chemin : {match_key}/{horodatage}-{suffixe}.{ext} — jamais
-- le nom de fichier original de l'utilisateur dans le chemin (le nom
-- original est conservé uniquement dans messages.media_meta.original_name
-- pour l'affichage). storage.foldername(name) découpe le chemin en
-- segments ; le 1er segment est le match_key.

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'chat-media:%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  -- INSERT : reprend exactement le prédicat de la policy INSERT déjà
  -- durcie sur "messages" (supabase-audit-fixes.sql) — participant du
  -- match_key ET like mutuel réel ET pas de blocage entre les deux profils.
  create policy "chat-media: televerse dans une conversation matchee"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and (select id from profiles where user_id = auth.uid())::text
      = any (string_to_array((storage.foldername(name))[1], '__'))
    and exists (
      select 1
      from unnest(string_to_array((storage.foldername(name))[1], '__')) as other_id
      where other_id::uuid <> (select id from profiles where user_id = auth.uid())
        and exists (
          select 1 from likes
          where from_id = (select id from profiles where user_id = auth.uid())
            and to_id = other_id::uuid
        )
        and exists (
          select 1 from likes
          where from_id = other_id::uuid
            and to_id = (select id from profiles where user_id = auth.uid())
        )
        and not exists (
          select 1 from blocks
          where (blocks.from_id = (select id from profiles where user_id = auth.uid()) and blocks.to_id = other_id::uuid)
             or (blocks.from_id = other_id::uuid and blocks.to_id = (select id from profiles where user_id = auth.uid()))
        )
    )
  );

  -- SELECT : reprend exactement le prédicat de la policy SELECT de
  -- "messages" (supabase-protect-rls.sql) — simple appartenance au match_key.
  create policy "chat-media: lit les fichiers de ses conversations"
  on storage.objects for select
  using (
    bucket_id = 'chat-media'
    and (select id from profiles where user_id = auth.uid())::text
      = any (string_to_array((storage.foldername(name))[1], '__'))
  );

  -- DELETE : bornée à ses propres fichiers (colonne "owner" native de
  -- Storage, définie automatiquement à l'upload) — permet de nettoyer un
  -- fichier orphelin après un upload réussi mais un INSERT "messages"
  -- échoué, sans clé service-role.
  create policy "chat-media: supprime ses propres fichiers"
  on storage.objects for delete
  using (bucket_id = 'chat-media' and owner = auth.uid());
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select id, public, file_size_limit from storage.buckets where id = 'chat-media';
-- select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'chat-media:%';
-- ============================================================================
