-- ============================================================================
-- post_media — galerie multi-photos/vidéos pour le fil général (Feed). À
-- exécuter dans Supabase : SQL Editor, après supabase-feed-posts.sql (fournit
-- la table posts et current_profile_id()).
-- ============================================================================
-- posts.media_url/media_kind (colonnes uniques, une seule pièce jointe par
-- publication) restent en place pour les publications déjà existantes — le
-- nouveau composeur (refonte multi-médias) écrit désormais dans cette table
-- séparée à la place, sans supprimer ni migrer les anciennes lignes. Le
-- rendu (PostCard.jsx) lit post_media en priorité et retombe sur
-- media_url/media_kind si post_media est vide, pour ne rien casser sur les
-- publications déjà publiées.

create table if not exists post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  url text not null,
  kind text not null check (kind in ('photo', 'video')),
  position int not null default 0,
  created_at timestamptz default now()
);
alter table post_media enable row level security;
create index if not exists idx_post_media_post on post_media(post_id, position);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='post_media' loop
    execute format('drop policy %I on public.post_media', pol.policyname);
  end loop;

  -- Même motif que posts : lecture ouverte à tout utilisateur authentifié,
  -- écriture/suppression réservées à l'auteur de la publication parente
  -- (post_media n'a pas sa propre colonne author_id, on la dérive de posts).
  create policy "Lecture des medias par tout utilisateur authentifie"
  on post_media for select
  to authenticated
  using (true);

  create policy "Ajouter un media a sa propre publication"
  on post_media for insert
  to authenticated
  with check (
    exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = current_profile_id())
  );

  create policy "Supprimer un media de sa propre publication"
  on post_media for delete
  to authenticated
  using (
    exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = current_profile_id())
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename from pg_tables where schemaname='public' and tablename='post_media';
-- select policyname from pg_policies where schemaname='public' and tablename='post_media';
-- ============================================================================
