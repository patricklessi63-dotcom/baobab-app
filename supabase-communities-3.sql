-- ============================================================================
-- Phase — Baobab Communautés 2.0 (suite) — médias, réactions, réponses.
-- À exécuter dans Supabase : SQL Editor (une fois), APRÈS supabase-communities.sql
-- et supabase-communities-2.sql.
-- ============================================================================
-- Complète les éléments explicitement différés dans le rapport précédent :
-- médias dans les publications de communauté, réactions multi-emoji,
-- réponses/édition de commentaires. Le bucket "post-media" du fil général
-- (supabase-feed-posts.sql) est PUBLIC (lecture ouverte à tous, adapté au
-- fil global) — jamais réutilisé ici : une communauté PRIVÉE dont les posts
-- sont protégés par RLS ne doit pas laisser fuiter ses images via une URL
-- publique. Nouveau bucket privé "community-media", RLS calquée sur
-- "chat-media" (supabase-chat-media-storage.sql), adaptée à la visibilité
-- de la communauté au lieu de l'appartenance à un match_key.

-- ----------------------------------------------------------------------------
-- 1. Médias sur community_posts
-- ----------------------------------------------------------------------------
alter table community_posts add column if not exists media_url text;
alter table community_posts add column if not exists media_kind text check (media_kind in ('image','video'));
-- Le texte devient optionnel dès qu'un média est joint (une photo seule est
-- une publication valide) — la contrainte précédente exigeait 1 à 4000
-- caractères de corps ; on l'assouplit à "vide autorisé si média présent".
alter table community_posts drop constraint if exists community_posts_body_check;
alter table community_posts add constraint community_posts_body_check
  check (char_length(body) <= 4000 and (char_length(body) > 0 or media_url is not null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media', 'community-media', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do nothing;

-- Convention de chemin : {community_id}/{horodatage}-{suffixe}.{ext}.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'community-media:%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "community-media: televerse en tant que membre"
  on storage.objects for insert
  with check (
    bucket_id = 'community-media'
    and is_community_member(((storage.foldername(name))[1])::uuid)
  );

  -- Même prédicat que community_posts SELECT (supabase-communities.sql) :
  -- publique = tout authentifié, privée = membres seulement.
  create policy "community-media: lit selon la visibilite de la communaute"
  on storage.objects for select
  using (
    bucket_id = 'community-media'
    and exists (
      select 1 from communities c where c.id = ((storage.foldername(name))[1])::uuid
        and (c.visibility = 'public' or is_community_member(c.id))
    )
  );

  create policy "community-media: supprime ses propres fichiers"
  on storage.objects for delete
  using (bucket_id = 'community-media' and owner = auth.uid());
end $$;

-- ----------------------------------------------------------------------------
-- 2. Réactions multi-emoji sur community_posts — community_post_likes avait
-- déjà exactement la bonne forme (unique post_id+profile_id, RLS déjà
-- conditionnée à la visibilité) : on ajoute seulement la colonne "emoji"
-- plutôt que de créer une nouvelle table. "Changer sa réaction" se fait par
-- delete+insert côté client (RLS déjà suffisante, aucune policy UPDATE requise).
-- ----------------------------------------------------------------------------
alter table community_post_likes add column if not exists emoji text not null default '❤️';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_post_likes_emoji_check') then
    alter table community_post_likes add constraint community_post_likes_emoji_check
      check (emoji in ('❤️','👍','😂','😮','😢','🎉'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Réponses + édition sur community_comments (section 19 : "répondre",
-- "modifier ses propres commentaires" — jamais construits, seule la
-- suppression existait).
-- ----------------------------------------------------------------------------
alter table community_comments add column if not exists reply_to_id uuid references community_comments(id) on delete set null;
alter table community_comments add column if not exists updated_at timestamptz;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_comments' and cmd='UPDATE' loop
    execute format('drop policy %I on public.community_comments', pol.policyname);
  end loop;

  -- Édition bornée à l'auteur — jamais un modérateur (il peut seulement
  -- supprimer, policy DELETE déjà existante et inchangée).
  create policy "L'auteur modifie son propre commentaire"
  on community_comments for update
  using (author_id = current_profile_id())
  with check (author_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns where table_name='community_posts' and column_name in ('media_url','media_kind');
-- select column_name from information_schema.columns where table_name='community_post_likes' and column_name='emoji';
-- select column_name from information_schema.columns where table_name='community_comments' and column_name in ('reply_to_id','updated_at');
-- select id, public from storage.buckets where id = 'community-media';
-- select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'community-media:%';
-- ============================================================================
