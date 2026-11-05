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

-- Prerequis : public.is_blocked_pair() (SQL-25, supabase-block-enforcement-messages-fix.sql, deja en production).
-- Une sous-selection directe sur `blocks` serait soumise a la RLS de l'appelant : la personne BLOQUEE ne verrait pas
-- le blocage et passerait la garde. is_blocked_pair() est SECURITY DEFINER et lit `blocks` sans RLS.
do $$
begin
  if to_regprocedure('public.is_blocked_pair(uuid, uuid)') is null then
    raise exception 'is_blocked_pair(uuid, uuid) introuvable : executer d''abord supabase-block-enforcement-messages-fix.sql (SQL-25)';
  end if;
end $$;

-- Une sous-requete passee a is_blocked_pair() s'execute avec les droits de l'appelant : la RLS de lecture cache le contenu de
-- la personne bloquee a celui qui l'a bloquee, la sous-requete renvoie NULL, is_blocked_pair(x, NULL) est faux et l'ecriture passerait.
-- On retrouve donc l'auteur DANS une fonction SECURITY DEFINER (meme definition que supabase-block-enforcement-content-fix.sql,
-- SQL-36 : `create or replace` identique, l'ordre d'execution des deux fichiers n'a pas d'importance).
create or replace function public.is_blocked_with_comment_author(p_actor uuid, p_comment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_blocked_pair(p_actor, (select c.author_id from public.post_comments c where c.id = p_comment_id));
$$;
revoke all on function public.is_blocked_with_comment_author(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_with_comment_author(uuid, uuid) to authenticated;

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
    and not public.is_blocked_with_comment_author(post_comment_likes.profile_id, post_comment_likes.comment_id)
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
  -- aimer, retirer, aimer de nouveau : une seule notification par personne, par PUBLICATION et par jour (la
  -- notification ne porte que l'id de la publication : deux commentaires du meme auteur aimes le meme jour = une seule)
  if exists (
    select 1 from notifications
    where recipient_id = v_author and actor_id = new.profile_id and type = 'comment_liked'
      and target_id = v_post and created_at > now() - interval '1 day'
  ) then return new; end if;
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


-- Les colonnes / tables ajoutees ci-dessus sont connues de l'API apres le rechargement du cache de schema
-- (sans cela, un premier appel peut echouer quelques secondes : « Could not find the ... column in the schema cache »).
notify pgrst, 'reload schema';

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
