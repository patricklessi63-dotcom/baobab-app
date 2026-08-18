-- ============================================================================
-- Fil général (Feed) — publications réellement persistées. À exécuter dans
-- Supabase : SQL Editor, après supabase-communities.sql (fournit
-- current_profile_id(), et notifications déjà pensée comme table générique
-- réutilisable — voir son commentaire d'en-tête) et supabase-scale-security-2.sql.
-- ============================================================================
-- Corrige un bug critique identifié à l'audit : le composeur de publication
-- du fil d'accueil n'écrivait jamais dans Supabase (state React local
-- uniquement, perdu au rechargement, invisible aux autres utilisateurs).
-- Calqué sur community_posts/community_post_likes/community_comments
-- (supabase-communities.sql), étendu pour les médias (le composeur en a déjà
-- l'UI) et l'édition (volontairement absente côté communautés, requise ici).

-- ----------------------------------------------------------------------------
-- 1. posts
-- ----------------------------------------------------------------------------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  media_url text,
  media_kind text check (media_kind in ('photo', 'video')),
  created_at timestamptz default now(),
  updated_at timestamptz
);
alter table posts enable row level security;
create index if not exists idx_posts_author_created on posts(author_id, created_at desc);
create index if not exists idx_posts_created on posts(created_at desc);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='posts' loop
    execute format('drop policy %I on public.posts', pol.policyname);
  end loop;

  -- Pas de notion de communauté ici (réseau global) — le filtrage des
  -- profils bloqués se fait côté client, comme déjà pratiqué pour les
  -- publications de communauté et les listes de membres.
  create policy "Lecture des publications par tout utilisateur authentifie"
  on posts for select
  to authenticated
  using (true);

  create policy "Publier en son propre nom"
  on posts for insert
  to authenticated
  with check (author_id = current_profile_id());

  -- UPDATE volontairement autorisée ici (absente côté community_posts) :
  -- l'édition est une exigence explicite pour le fil général.
  create policy "Editer sa propre publication"
  on posts for update
  to authenticated
  using (author_id = current_profile_id())
  with check (author_id = current_profile_id());

  create policy "Supprimer sa propre publication"
  on posts for delete
  to authenticated
  using (author_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- 2. post_likes — même motif que community_post_likes
-- ----------------------------------------------------------------------------
create table if not exists post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, profile_id)
);
alter table post_likes enable row level security;
create index if not exists idx_post_likes_post on post_likes(post_id);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='post_likes' loop
    execute format('drop policy %I on public.post_likes', pol.policyname);
  end loop;

  create policy "Lecture des likes par tout utilisateur authentifie"
  on post_likes for select to authenticated using (true);

  create policy "Liker en son propre nom"
  on post_likes for insert to authenticated
  with check (profile_id = current_profile_id());

  create policy "Retirer son propre like"
  on post_likes for delete to authenticated
  using (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- 3. post_comments — même motif que community_comments
-- ----------------------------------------------------------------------------
create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now()
);
alter table post_comments enable row level security;
create index if not exists idx_post_comments_post on post_comments(post_id);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='post_comments' loop
    execute format('drop policy %I on public.post_comments', pol.policyname);
  end loop;

  create policy "Lecture des commentaires par tout utilisateur authentifie"
  on post_comments for select to authenticated using (true);

  create policy "Commenter en son propre nom"
  on post_comments for insert to authenticated
  with check (author_id = current_profile_id());

  create policy "Auteur du commentaire ou de la publication supprime"
  on post_comments for delete to authenticated
  using (
    author_id = current_profile_id()
    or exists (select 1 from posts p where p.id = post_comments.post_id and p.author_id = current_profile_id())
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. post_reports — meme motif que community_reports (la table generique
-- "reports" n'a pas de policy SELECT et un schema from_id/to_id inadapte a
-- un signalement type post/commentaire).
-- ----------------------------------------------------------------------------
create table if not exists post_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  from_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('harcelement','spam','faux_profil','contenu_inapproprie','arnaque','autre')),
  reason text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz default now()
);
alter table post_reports enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='post_reports' loop
    execute format('drop policy %I on public.post_reports', pol.policyname);
  end loop;

  create policy "Signaler en son propre nom"
  on post_reports for insert to authenticated
  with check (from_id = current_profile_id());

  -- Pas de policy SELECT côté client — journal destiné à un futur tableau
  -- de bord admin, même raisonnement que analytics_events/community_reports.
end $$;

-- ----------------------------------------------------------------------------
-- 5. Notifications like/commentaire — la table "notifications" est déjà
-- pensée comme générique et réutilisable (voir son commentaire d'en-tête
-- dans supabase-communities.sql, qui anticipe explicitement "un futur
-- système, ex. fil général réellement persisté"). Contrairement à
-- community_posts qui exclut delibérément ces notifications (post de
-- communauté = contenu collectif, risque de spam), une publication du fil
-- général est le contenu personnel de l'auteur — notifier son like/
-- commentaire est attendu (item 22 du cahier des charges).
-- ----------------------------------------------------------------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'join_request_received','join_request_accepted','invite_received','report_received',
  'event_invite','event_participation_confirmed','event_updated','event_cancelled',
  'event_reminder_24h','event_reminder_1h','event_report_received','event_waitlist_promoted',
  'premium_activated','premium_payment_failed','premium_cancelled','premium_renewing_soon',
  'new_follower','post_liked','post_commented'
));

create or replace function notify_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author_id uuid;
begin
  select author_id into v_author_id from posts where id = new.post_id;
  if v_author_id is not null and v_author_id != new.profile_id then
    insert into notifications (recipient_id, actor_id, type, target_type, target_id)
    values (v_author_id, new.profile_id, 'post_liked', 'post', new.post_id);
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_post_like on post_likes;
create trigger trg_notify_post_like after insert on post_likes
for each row execute function notify_post_like();

create or replace function notify_post_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author_id uuid;
begin
  select author_id into v_author_id from posts where id = new.post_id;
  if v_author_id is not null and v_author_id != new.author_id then
    insert into notifications (recipient_id, actor_id, type, target_type, target_id)
    values (v_author_id, new.author_id, 'post_commented', 'post', new.post_id);
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_post_comment on post_comments;
create trigger trg_notify_post_comment after insert on post_comments
for each row execute function notify_post_comment();

-- ----------------------------------------------------------------------------
-- 6. Storage — nouveau bucket "post-media" (public-read, même motif RLS que
-- "avatars" : upload/suppression restreints au dossier auth.uid()).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like '%post-media%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "Lecture publique post-media"
  on storage.objects for select
  using (bucket_id = 'post-media');

  create policy "Televersement post-media dans son propre dossier"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "Suppression post-media dans son propre dossier"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename from pg_tables where schemaname='public' and tablename in ('posts','post_likes','post_comments','post_reports');
-- select id, public from storage.buckets where id = 'post-media';
-- select conname from pg_constraint where conname = 'notifications_type_check';
-- ============================================================================
