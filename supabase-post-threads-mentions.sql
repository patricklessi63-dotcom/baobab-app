-- ============================================================================
-- SQL-33 - Fil general : reponses aux commentaires (un niveau), mentions @, notifications
--
-- LIVRE, NON EXECUTE. A jouer d'abord sur le projet de repetition (LANCEMENT.md 9.7).
-- Fichier entierement ASCII (aucun caractere special hors commentaires).
-- Additif : aucune donnee supprimee, aucune policy modifiee.
--
-- 1. post_comments.parent_id : une reponse pointe vers un commentaire RACINE de la meme publication.
--    Repondre a une reponse la rattache au commentaire racine (un seul niveau d'imbrication affiche).
-- 2. mentions (jsonb) sur posts et post_comments : [{"id": "<uuid>", "name": "Awa"}, ...], 5 au plus.
--    Le texte du message garde "@Awa" en clair ; la liste sert aux notifications et au surlignage.
-- 3. Notifications : 'post_mention' (quelqu'un t'a mentionne) et 'comment_replied' (reponse a ton
--    commentaire). Aucune notification entre deux personnes qui se sont bloquees, ni a soi-meme.
--    Le type est AJOUTE a la contrainte notifications_type_check actuelle (sa liste n'est pas
--    recopiee : elle est relue puis completee, donc aucune derive possible avec d'autres fichiers).
-- Retour arriere en pied de fichier.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reponses
-- ---------------------------------------------------------------------------
alter table post_comments add column if not exists parent_id uuid references post_comments(id) on delete cascade;
create index if not exists idx_post_comments_parent on post_comments(parent_id) where parent_id is not null;

create or replace function post_comment_check_parent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent post_comments%rowtype;
begin
  if new.parent_id is null then return new; end if;
  select * into v_parent from post_comments where id = new.parent_id;
  if not found or v_parent.post_id <> new.post_id then
    raise exception 'THREAD_INVALID: Ce commentaire ne peut pas recevoir de reponse.' using errcode = 'P0001';
  end if;
  -- pas de reponse entre deux personnes qui se sont bloquees (dans un sens ou l'autre) : sinon la personne bloquee
  -- pouvait encore repondre au commentaire de celle qui l'a bloquee (la fonction est SECURITY DEFINER : elle lit blocks sans RLS)
  if exists (
    select 1 from blocks b
    where (b.from_id = new.author_id and b.to_id = v_parent.author_id) or (b.from_id = v_parent.author_id and b.to_id = new.author_id)
  ) then
    raise exception 'THREAD_INVALID: Ce commentaire ne peut pas recevoir de reponse.' using errcode = 'P0001';
  end if;
  -- repondre a une reponse : on rattache au commentaire racine (un seul niveau)
  if v_parent.parent_id is not null then new.parent_id := v_parent.parent_id; end if;
  return new;
end;
$$;
drop trigger if exists trg_post_comment_check_parent on post_comments;
create trigger trg_post_comment_check_parent before insert on post_comments
  for each row execute function post_comment_check_parent();

-- ---------------------------------------------------------------------------
-- 2. Mentions
-- ---------------------------------------------------------------------------
alter table posts add column if not exists mentions jsonb not null default '[]'::jsonb;
alter table post_comments add column if not exists mentions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_mentions_check') then
    alter table posts add constraint posts_mentions_check
      check (jsonb_typeof(mentions) = 'array' and jsonb_array_length(mentions) <= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'post_comments_mentions_check') then
    alter table post_comments add constraint post_comments_mentions_check
      check (jsonb_typeof(mentions) = 'array' and jsonb_array_length(mentions) <= 5);
  end if;
end $$;

-- Normalisation SERVEUR des mentions : seules les personnes qui existent sont gardees, sans doublon, et leur
-- NOM est relu depuis profiles (un client modifie ne peut pas faire pointer « @Support » vers un autre profil).
-- S'execute AVANT la contrainte des 5 mentions : plus de 5 personnes valides restent refusees.
create or replace function post_normalize_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.mentions is null or jsonb_typeof(new.mentions) <> 'array' or jsonb_array_length(new.mentions) = 0 then
    new.mentions := '[]'::jsonb;
    return new;
  end if;
  new.mentions := coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by m.ord)
    from (
      select distinct on (x.id) x.id, x.ord
      from (
        select case when (t.e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (t.e ->> 'id')::uuid end as id, t.ord
        from jsonb_array_elements(new.mentions) with ordinality as t(e, ord)
      ) x
      where x.id is not null
      order by x.id, x.ord
    ) m
    join profiles p on p.id = m.id
  ), '[]'::jsonb);
  return new;
end;
$$;
drop trigger if exists trg_post_normalize_mentions on posts;
create trigger trg_post_normalize_mentions before insert on posts
  for each row execute function post_normalize_mentions();
drop trigger if exists trg_post_comment_normalize_mentions on post_comments;
create trigger trg_post_comment_normalize_mentions before insert on post_comments
  for each row execute function post_normalize_mentions();

-- ---------------------------------------------------------------------------
-- 3. Types de notification : ajout a la contrainte existante (sans recopier sa liste)
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
  if position('post_mention' in v_def) > 0 and position('comment_replied' in v_def) > 0 then return; end if;
  -- contenu entre ARRAY[ et ] : 'a'::text, 'b'::text, ...
  v_list := substring(v_def from 'ARRAY\[(.*)\]');
  if v_list is null then
    raise exception 'Forme inattendue de notifications_type_check : %', v_def;
  end if;
  alter table notifications drop constraint notifications_type_check;
  execute 'alter table notifications add constraint notifications_type_check check (type = any (array['
    || v_list || ', ''post_mention''::text, ''comment_replied''::text]))';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Notifications de mentions et de reponses
-- ---------------------------------------------------------------------------
create or replace function post_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_post uuid;
  v_item jsonb;
  v_target uuid;
  v_done uuid[] := '{}';
begin
  if tg_table_name = 'posts' then
    v_author := new.author_id; v_post := new.id;
  else
    v_author := new.author_id; v_post := new.post_id;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(new.mentions, '[]'::jsonb)) loop
    begin
      v_target := nullif(v_item ->> 'id', '')::uuid;
    exception when others then
      v_target := null;
    end;
    continue when v_target is null or v_target = v_author or v_target = any (v_done);
    v_done := v_done || v_target;
    continue when not exists (select 1 from profiles where id = v_target);
    continue when exists (
      select 1 from blocks b
      where (b.from_id = v_author and b.to_id = v_target) or (b.from_id = v_target and b.to_id = v_author)
    );
    insert into notifications (recipient_id, actor_id, type, target_type, target_id)
    values (v_target, v_author, 'post_mention', 'post', v_post);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_post_notify_mentions on posts;
create trigger trg_post_notify_mentions after insert on posts
  for each row execute function post_notify_mentions();
drop trigger if exists trg_post_comment_notify_mentions on post_comments;
create trigger trg_post_comment_notify_mentions after insert on post_comments
  for each row execute function post_notify_mentions();

create or replace function post_notify_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent_author uuid;
begin
  if new.parent_id is null then return new; end if;
  select author_id into v_parent_author from post_comments where id = new.parent_id;
  if v_parent_author is null or v_parent_author = new.author_id then return new; end if;
  if exists (
    select 1 from blocks b
    where (b.from_id = new.author_id and b.to_id = v_parent_author) or (b.from_id = v_parent_author and b.to_id = new.author_id)
  ) then return new; end if;
  -- deja notifiee par une mention dans cette meme reponse : pas de doublon
  if exists (select 1 from jsonb_array_elements(coalesce(new.mentions, '[]'::jsonb)) m where m ->> 'id' = v_parent_author::text) then return new; end if;
  insert into notifications (recipient_id, actor_id, type, target_type, target_id)
  values (v_parent_author, new.author_id, 'comment_replied', 'post', new.post_id);
  return new;
end;
$$;
drop trigger if exists trg_post_notify_reply on post_comments;
create trigger trg_post_notify_reply after insert on post_comments
  for each row execute function post_notify_reply();

revoke all on function post_comment_check_parent(), post_normalize_mentions(), post_notify_mentions(), post_notify_reply() from public, anon, authenticated;


-- Les colonnes / tables ajoutees ci-dessus sont connues de l'API apres le rechargement du cache de schema
-- (sans cela, un premier appel peut echouer quelques secondes : « Could not find the ... column in the schema cache »).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verifications apres execution (lecture seule) :
--   select column_name from information_schema.columns where table_name = 'post_comments' and column_name in ('parent_id','mentions');
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_type_check';   -- contient post_mention
--   AVANT de jouer ce fichier, copier hors depot le resultat de cette meme requete : apres execution, tous les types existants
--   doivent etre toujours presents (le bloc reconstruit la contrainte a partir de sa definition actuelle).
--   select tgname from pg_trigger where tgname like 'trg_post_%' and not tgisinternal;
--
-- Retour arriere (sans perte de commentaires) :
--   drop trigger if exists trg_post_normalize_mentions on posts;
--   drop trigger if exists trg_post_comment_normalize_mentions on post_comments;
--   drop function if exists post_normalize_mentions();
--   drop trigger if exists trg_post_notify_reply on post_comments;
--   drop trigger if exists trg_post_comment_notify_mentions on post_comments;
--   drop trigger if exists trg_post_notify_mentions on posts;
--   drop trigger if exists trg_post_comment_check_parent on post_comments;
--   drop function if exists post_notify_reply(), post_notify_mentions(), post_comment_check_parent();
--   alter table post_comments drop column if exists parent_id;      -- supprime aussi le lien des reponses
--   alter table post_comments drop column if exists mentions;
--   alter table posts drop column if exists mentions;
--   (la contrainte notifications_type_check peut rester : elle accepte simplement deux types de plus)
-- ---------------------------------------------------------------------------
