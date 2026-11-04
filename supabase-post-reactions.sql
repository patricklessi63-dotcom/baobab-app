-- ============================================================================
-- SQL-32 - Reactions multiples sur les publications du fil general (Actualites)
--
-- LIVRE, NON EXECUTE. A jouer d'abord sur le projet de repetition (LANCEMENT.md 9.7).
-- Fichier entierement ASCII : aucun emoji en clair (codes Unicode via chr()), il se colle sans risque
-- d'alteration dans l'editeur SQL (le piege qui a bloque les reactions des statuts, voir SQL-26).
--
-- Principe : on s'appuie sur la table existante post_likes (une ligne par personne et par publication,
-- unique(post_id, profile_id)) en lui ajoutant une colonne "emoji". Les likes existants deviennent des
-- reactions "coeur" (valeur par defaut). Une seule reaction active par personne : changer de reaction =
-- UPDATE de sa ligne, la retirer = DELETE. Meme motif que community_post_likes (supabase-communities-3/4.sql).
--
-- Six reactions : coeur, rire, yeux en coeur, applaudissements, poignee de main, surprise.
--   chr(10084)=coeur  chr(128514)=rire  chr(128525)=yeux en coeur  chr(128079)=applaudissements
--   chr(129309)=poignee de main  chr(128558)=surprise  (chr(65039) = selecteur de variante, accepte ou non)
--
-- Additif : aucune donnee supprimee, aucune policy existante modifiee (sauf l'ajout d'une policy UPDATE
-- qui n'existait pas). Retour arriere en bas du fichier.
-- ============================================================================

alter table post_likes add column if not exists emoji text not null default (chr(10084) || chr(65039));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'post_likes_emoji_check') then
    alter table post_likes add constraint post_likes_emoji_check
      check (replace(emoji, chr(65039), '') in (chr(10084), chr(128514), chr(128525), chr(128079), chr(129309), chr(128558)));
  end if;
end $$;

-- Changer SA reaction (jamais celle d'un tiers), avec les memes gardes d'etat de compte et de blocage
-- que l'insertion d'un like (supabase-COMBINED-pending-fixes.sql : "Liker en son propre nom").
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'post_likes' and cmd = 'UPDATE' loop
    execute format('drop policy %I on public.post_likes', pol.policyname);
  end loop;

  create policy "Changer sa propre reaction"
  on post_likes for update to authenticated
  using (profile_id = current_profile_id())
  with check (
    profile_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = post_likes.profile_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = post_likes.profile_id
        and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from posts p
      where p.id = post_likes.post_id
        and exists (
          select 1 from blocks b
          where (b.from_id = post_likes.profile_id and b.to_id = p.author_id)
             or (b.from_id = p.author_id and b.to_id = post_likes.profile_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Verifications apres execution (lecture seule) :
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.post_likes'::regclass and contype = 'c';
--   select policyname, cmd from pg_policies where tablename = 'post_likes';        -- une ligne UPDATE
--   select emoji, count(*) from post_likes group by 1;                              -- tout en coeur au depart
--
-- Retour arriere (sans perte de likes) :
--   drop policy if exists "Changer sa propre reaction" on post_likes;
--   alter table post_likes drop constraint if exists post_likes_emoji_check;
--   alter table post_likes drop column if exists emoji;
-- ----------------------------------------------------------------------------
