-- ============================================================================
-- SQL-35 - Fil general : « j'aime » sur les commentaires des publications + notification
--
-- LIVRE, NON EXECUTE. A jouer d'abord sur le projet de repetition (LANCEMENT.md 9.7).
-- Fichier entierement ASCII. Additif : une nouvelle table, aucune donnee ni policy existante modifiee.
--
-- 1. post_comment_likes : une ligne par personne et par commentaire (unique), suppression en cascade
--    avec le commentaire. Lecture par les comptes connectes (compteurs) ; ecriture reservee a SON propre
--    nom, avec les gardes d'etat de compte et de blocage deja utilisees pour les likes de publications
--    (supabase-COMBINED-pending-fixes.sql : « Liker en son propre nom »).
-- 2. Notification 'comment_liked' (a aime ton commentaire) : AJOUTEE a la contrainte notifications_type_check
--    actuelle SANS recopier sa liste (elle est relue puis completee). Jamais a soi-meme, jamais entre
--    deux personnes qui se sont bloquees.
-- Retour arriere en pied de fichier.
-- ============================================================================

create table if not exists post_comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references post_comments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, profile_id)
);
create index if not exists idx_post_comment_likes_comment on post_comment_likes(comment_id);
create index if not exists idx_post_comment_likes_profile on post_comment_likes(profile_id);

alter table post_comment_likes enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'post_comment_likes' loop
    execute format('drop policy %I on public.post_comment_likes', pol.policyname);
  end loop;

  create policy "Compteurs de likes de commentaires lisibles"
  on post_comment_likes for select to authenticated using (true);

  create policy "Aimer un commentaire en son propre nom"
  on post_comment_likes for insert to authenticated
  with check (
    profile_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = post_comment_likes.profile_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = post_comment_likes.profile_id and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from post_comments c
      where c.id = post_comment_likes.comment_id
        and exists (
          select 1 from blocks b
          where (b.from_id = post_comment_likes.profile_id and b.to_id = c.author_id)
             or (b.from_id = c.author_id and b.to_id = post_comment_likes.profile_id)
        )
    )
  );

  create policy "Retirer son propre like de commentaire"
  on post_comment_likes for delete to authenticated using (profile_id = current_profile_id());
end $$;

-- ---------------------------------------------------------------------------
-- Type de notification : ajout a la contrainte existante (sans recopier sa liste)
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_list text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint where conname = 'notifications_type_check' and conrelid = 'public.notifications'::regclass;
  if v_def is null then
    raise exception 'notifications_type_check introuvable : executer d''abord les fichiers de notifications';
  end if;
  if position('comment_liked' in v_def) > 0 then return; end if;
  v_list := substring(v_def from 'ARRAY\[(.*)\]');
  if v_list is null then
    raise exception 'Forme inattendue de notifications_type_check : %', v_def;
  end if;
  alter table notifications drop constraint notifications_type_check;
  execute 'alter table notifications add constraint notifications_type_check check (type = any (array['
    || v_list || ', ''comment_liked''::text]))';
end $$;

create or replace function post_notify_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_post uuid;
begin
  select author_id, post_id into v_author, v_post from post_comments where id = new.comment_id;
  if v_author is null or v_author = new.profile_id then return new; end if;
  if exists (
    select 1 from blocks b
    where (b.from_id = new.profile_id and b.to_id = v_author) or (b.from_id = v_author and b.to_id = new.profile_id)
  ) then return new; end if;
  insert into notifications (recipient_id, actor_id, type, target_type, target_id)
  values (v_author, new.profile_id, 'comment_liked', 'post', v_post);
  return new;
end;
$$;
drop trigger if exists trg_post_notify_comment_like on post_comment_likes;
create trigger trg_post_notify_comment_like after insert on post_comment_likes
  for each row execute function post_notify_comment_like();
revoke all on function post_notify_comment_like() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verifications apres execution (lecture seule) :
--   select policyname, cmd from pg_policies where tablename = 'post_comment_likes';   -- 3 lignes
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_type_check';   -- contient comment_liked
--
-- Retour arriere (sans perte de commentaires) :
--   drop trigger if exists trg_post_notify_comment_like on post_comment_likes;
--   drop function if exists post_notify_comment_like();
--   drop table if exists post_comment_likes;
--   (la contrainte notifications_type_check peut rester : elle accepte simplement un type de plus)
-- ---------------------------------------------------------------------------
