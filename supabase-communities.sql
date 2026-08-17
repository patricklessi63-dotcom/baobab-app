-- ============================================================================
-- Phase 6 — Communautés Baobab. À exécuter dans Supabase : SQL Editor (une fois).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. communities + community_members — structure des tables D'ABORD (sans
-- RLS), car les fonctions centrales ci-dessous référencent
-- "community_members" : Postgres vérifie l'existence des tables
-- référencées à la création d'une fonction "language sql", donc la table
-- doit exister avant la fonction, pas l'inverse.
-- ----------------------------------------------------------------------------
create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  city text,
  visibility text not null default 'public' check (visibility in ('public','private','invite_only')),
  cover_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table communities enable row level security;

create table if not exists community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  joined_at timestamptz default now(),
  unique (community_id, profile_id)
);
alter table community_members enable row level security;

-- ----------------------------------------------------------------------------
-- 0. Fonctions centrales — répond à l'exigence "permissions centralisées,
-- pas dispersées dans chaque composant". Le motif
-- "(select id from profiles where user_id = auth.uid())" est aujourd'hui
-- dupliqué en clair dans presque tous les fichiers SQL du dépôt ; ce
-- fichier ne touche pas les anciennes policies (risque de casser du code
-- qui fonctionne), mais tout le NOUVEAU code ci-dessous utilise ces
-- fonctions au lieu de répéter la sous-requête.
-- ----------------------------------------------------------------------------
create or replace function current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid();
$$;

create or replace function community_member_role(p_community_id uuid, p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from community_members where community_id = p_community_id and profile_id = p_profile_id;
$$;

create or replace function is_community_staff(p_community_id uuid) -- owner/admin
returns boolean language sql stable security definer set search_path = public as $$
  select community_member_role(p_community_id, current_profile_id()) in ('owner','admin');
$$;

create or replace function is_community_mod(p_community_id uuid) -- owner/admin/moderator
returns boolean language sql stable security definer set search_path = public as $$
  select community_member_role(p_community_id, current_profile_id()) in ('owner','admin','moderator');
$$;

create or replace function is_community_member(p_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select community_member_role(p_community_id, current_profile_id()) is not null;
$$;

-- ----------------------------------------------------------------------------
-- 2. RLS de communities (les fonctions ci-dessus existent maintenant)
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='communities' loop
    execute format('drop policy %I on public.communities', pol.policyname);
  end loop;

  -- Une communauté privée reste DÉCOUVRABLE (item 10 : "voir" est permis,
  -- seul le contenu est protégé) — select ouverte à tous les authentifiés.
  create policy "Lecture publique des communautes"
  on communities for select using (true);

  create policy "Un membre cree une communaute en son propre nom"
  on communities for insert
  with check (created_by = current_profile_id());

  create policy "Le staff modifie sa communaute"
  on communities for update
  using (is_community_staff(id));

  -- Aucun bouton "Supprimer" construit cette phase, mais la policy doit
  -- exister (item 28 : ne jamais pouvoir supprimer une communauté qu'on
  -- ne possède pas — sans policy DELETE, RLS refuse tout, y compris au
  -- vrai propriétaire ; avec celle-ci, seul le owner le peut).
  create policy "Le proprietaire supprime sa communaute"
  on communities for delete
  using (community_member_role(id, current_profile_id()) = 'owner');
end $$;

-- ----------------------------------------------------------------------------
-- RLS de community_members
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_members' loop
    execute format('drop policy %I on public.community_members', pol.policyname);
  end loop;

  -- Liste de membres publique (item 19 restreint les CHAMPS privés d'un
  -- profil, pas la liste elle-même — géré par PublicProfileModal).
  create policy "Lecture publique des membres"
  on community_members for select using (true);

  -- Auto-adhésion directe UNIQUEMENT si la communauté est publique.
  -- Privé/invitation passent exclusivement par les RPC (jamais un insert direct).
  create policy "Rejoindre directement une communaute publique"
  on community_members for insert
  with check (
    profile_id = current_profile_id()
    and role = 'member'
    and exists (select 1 from communities c where c.id = community_id and c.visibility = 'public')
  );

  -- Correction de sécurité (item 28) : la hiérarchie doit être respectée,
  -- pas "tout le staff peut tout faire" — sinon un admin pourrait se
  -- promouvoir owner ou modifier un autre admin/owner.
  -- "role" dans USING = valeur AVANT modification (ligne ciblée),
  -- "role" dans WITH CHECK = valeur APRÈS modification (nouvelle valeur).
  create policy "Changement de role selon la hierarchie"
  on community_members for update
  using (
    community_member_role(community_id, current_profile_id()) = 'owner'
    or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
  )
  with check (
    community_member_role(community_id, current_profile_id()) = 'owner'
    or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
  );

  create policy "Quitter ou etre retire selon la hierarchie"
  on community_members for delete
  using (
    profile_id = current_profile_id()
    or (community_member_role(community_id, current_profile_id()) = 'owner' and profile_id <> current_profile_id())
    or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. community_join_requests
-- ----------------------------------------------------------------------------
create table if not exists community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id) on delete set null
);
alter table community_join_requests enable row level security;

-- Index unique PARTIEL (pas une contrainte simple, qui empêcherait tout
-- re-essai après un refus) : une seule demande "pending" à la fois par
-- personne/communauté — anti-spam (item 25/38).
drop index if exists community_join_requests_one_pending;
create unique index community_join_requests_one_pending
  on community_join_requests (community_id, profile_id) where status = 'pending';

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_join_requests' loop
    execute format('drop policy %I on public.community_join_requests', pol.policyname);
  end loop;

  create policy "Voir ses propres demandes ou celles de sa communaute"
  on community_join_requests for select
  using (profile_id = current_profile_id() or is_community_staff(community_id));

  create policy "Demander a rejoindre une communaute privee en son propre nom"
  on community_join_requests for insert
  with check (
    profile_id = current_profile_id()
    and exists (select 1 from communities c where c.id = community_id and c.visibility = 'private')
  );

  -- Aucune policy UPDATE côté client : accepter/refuser passe uniquement
  -- par les RPC accept_join_request/reject_join_request (item 28 :
  -- "ne jamais laisser le frontend décider seul de l'acceptation").
end $$;

-- ----------------------------------------------------------------------------
-- 4. community_posts — texte seul cette phase (voir plan : pas de media_url,
-- l'exemple du cahier des charges est du texte pur).
-- ----------------------------------------------------------------------------
create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz default now()
);
alter table community_posts enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_posts' loop
    execute format('drop policy %I on public.community_posts', pol.policyname);
  end loop;

  -- OBLIGATOIRE (item 17) : une communauté privée doit voir ses
  -- publications protégées AU NIVEAU BASE, pas seulement côté UI.
  create policy "Lecture des posts selon visibilite"
  on community_posts for select
  using (exists (
    select 1 from communities c where c.id = community_posts.community_id
      and (c.visibility = 'public' or is_community_member(c.id))
  ));

  create policy "Un membre poste en son propre nom"
  on community_posts for insert
  with check (author_id = current_profile_id() and is_community_member(community_id));

  create policy "Auteur ou moderateur supprime un post"
  on community_posts for delete
  using (author_id = current_profile_id() or is_community_mod(community_id));
end $$;

-- ----------------------------------------------------------------------------
-- 5. community_post_likes
-- ----------------------------------------------------------------------------
create table if not exists community_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, profile_id)
);
alter table community_post_likes enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_post_likes' loop
    execute format('drop policy %I on public.community_post_likes', pol.policyname);
  end loop;

  -- Conditionnée à la visibilité du post parent : sinon "aimer" un post
  -- privé fuiterait indirectement l'appartenance à la communauté.
  create policy "Lecture des likes selon visibilite du post"
  on community_post_likes for select
  using (exists (
    select 1 from community_posts p join communities c on c.id = p.community_id
    where p.id = community_post_likes.post_id and (c.visibility = 'public' or is_community_member(c.id))
  ));

  create policy "Liker en son propre nom"
  on community_post_likes for insert
  with check (profile_id = current_profile_id());

  create policy "Retirer son propre like"
  on community_post_likes for delete
  using (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- 6. community_comments
-- ----------------------------------------------------------------------------
create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now()
);
alter table community_comments enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_comments' loop
    execute format('drop policy %I on public.community_comments', pol.policyname);
  end loop;

  create policy "Lecture des commentaires selon visibilite du post"
  on community_comments for select
  using (exists (
    select 1 from community_posts p join communities c on c.id = p.community_id
    where p.id = community_comments.post_id and (c.visibility = 'public' or is_community_member(c.id))
  ));

  create policy "Un membre commente en son propre nom"
  on community_comments for insert
  with check (
    author_id = current_profile_id()
    and is_community_member((select community_id from community_posts where id = post_id))
  );

  create policy "Auteur ou moderateur supprime un commentaire"
  on community_comments for delete
  using (
    author_id = current_profile_id()
    or is_community_mod((select community_id from community_posts where id = post_id))
  );
end $$;

-- ----------------------------------------------------------------------------
-- 7. community_reports — volontairement séparée de "reports" (qui n'a
-- aucune policy SELECT par design, dashboard uniquement ; la modération
-- de communauté a besoin d'une vraie visibilité en-app pour le staff).
-- ----------------------------------------------------------------------------
create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','member','community')),
  target_id uuid not null,
  from_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('harcelement','spam','contenu_inapproprie','arnaque','autre')),
  reason text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz default now()
);
alter table community_reports enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_reports' loop
    execute format('drop policy %I on public.community_reports', pol.policyname);
  end loop;

  create policy "Signaler en son propre nom"
  on community_reports for insert
  with check (from_id = current_profile_id());

  create policy "Le staff/moderation voit les signalements de sa communaute"
  on community_reports for select using (is_community_mod(community_id));

  create policy "Le staff/moderation traite les signalements"
  on community_reports for update using (is_community_mod(community_id));
end $$;

-- ----------------------------------------------------------------------------
-- 8. community_invites — réelle et persistante (item 25), mais l'UI de
-- réception/acceptation n'est PAS construite cette phase (item 11 :
-- préparer l'architecture sans la simuler). Le RPC accept_invite existe
-- déjà pour que ce soit trivial à finir plus tard.
-- ----------------------------------------------------------------------------
create table if not exists community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  invited_by uuid not null references profiles(id) on delete cascade,
  invited_profile_id uuid references profiles(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz default now(),
  unique (community_id, invited_profile_id)
);
alter table community_invites enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_invites' loop
    execute format('drop policy %I on public.community_invites', pol.policyname);
  end loop;

  create policy "Le staff cree des invitations"
  on community_invites for insert
  with check (invited_by = current_profile_id() and is_community_staff(community_id));

  create policy "Voir ses invitations recues ou celles envoyees par son staff"
  on community_invites for select
  using (invited_profile_id = current_profile_id() or is_community_staff(community_id));

  create policy "Le staff revoque une invitation"
  on community_invites for update
  using (is_community_staff(community_id));
end $$;

-- ----------------------------------------------------------------------------
-- 9. notifications — infrastructure générique nouvelle (aucune table
-- persistée n'existait avant cette phase, voir plan/rapport). Pas
-- spécifique aux communautés : type/target_type/payload génériques pour
-- qu'un futur système (ex. fil général réellement persisté) réutilise la
-- même table plutôt que d'en créer une troisième.
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null check (type in (
    'join_request_received','join_request_accepted','invite_received','report_received'
  )),
  community_id uuid references communities(id) on delete cascade,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);
alter table notifications enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='notifications' loop
    execute format('drop policy %I on public.notifications', pol.policyname);
  end loop;

  create policy "Voir ses propres notifications"
  on notifications for select using (recipient_id = current_profile_id());

  create policy "Marquer ses propres notifications comme lues"
  on notifications for update using (recipient_id = current_profile_id());

  -- Aucune policy INSERT côté client : les lignes sont créées
  -- exclusivement par les triggers/RPC SECURITY DEFINER ci-dessous,
  -- jamais directement par un utilisateur vers la boîte de quelqu'un d'autre.
end $$;

-- ----------------------------------------------------------------------------
-- 10. RPC — première utilisation de supabase.rpc() dans ce projet.
-- ----------------------------------------------------------------------------

-- Crée la communauté ET la ligne de membre "owner" en une seule
-- transaction atomique — un insert client brut ne pourrait pas le faire
-- en toute sécurité (la policy d'auto-adhésion de community_members
-- n'autorise que le rôle "member" sur une communauté publique).
create or replace function create_community(
  p_name text, p_description text, p_category text, p_city text, p_visibility text, p_cover_url text
)
returns communities
language plpgsql security definer set search_path = public
as $$
declare v_community communities;
begin
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Le nom est requis';
  end if;
  insert into communities (name, description, category, city, visibility, cover_url, created_by)
  values (trim(p_name), p_description, p_category, p_city, coalesce(p_visibility, 'public'), p_cover_url, current_profile_id())
  returning * into v_community;

  insert into community_members (community_id, profile_id, role)
  values (v_community.id, current_profile_id(), 'owner');

  return v_community;
end;
$$;

create or replace function accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid; v_profile_id uuid;
begin
  select community_id, profile_id into v_community_id, v_profile_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  if not is_community_staff(v_community_id) then
    raise exception 'Non autorise';
  end if;

  update community_join_requests
  set status = 'accepted', decided_at = now(), decided_by = current_profile_id()
  where id = p_request_id;

  insert into community_members (community_id, profile_id, role)
  values (v_community_id, v_profile_id, 'member')
  on conflict (community_id, profile_id) do nothing;

  insert into notifications (recipient_id, type, actor_id, community_id)
  values (v_profile_id, 'join_request_accepted', current_profile_id(), v_community_id);
end;
$$;

create or replace function reject_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid;
begin
  select community_id into v_community_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  if not is_community_staff(v_community_id) then
    raise exception 'Non autorise';
  end if;

  update community_join_requests
  set status = 'rejected', decided_at = now(), decided_by = current_profile_id()
  where id = p_request_id;
end;
$$;

create or replace function accept_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid;
begin
  select community_id into v_community_id
    from community_invites
    where id = p_invite_id and status = 'pending' and invited_profile_id = current_profile_id()
    for update;
  if not found then
    raise exception 'Invitation introuvable ou deja traitee';
  end if;

  update community_invites set status = 'accepted' where id = p_invite_id;

  insert into community_members (community_id, profile_id, role)
  values (v_community_id, current_profile_id(), 'member')
  on conflict (community_id, profile_id) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. Triggers de notification — fan-out vers le staff concerné / l'invité.
-- Volontairement PAS de trigger pour "nouvelle publication" ni "mention"
-- cette phase (aucun analyseur @mention n'existe dans l'app, et un
-- fan-out par publication serait potentiellement spammy — hors périmètre
-- explicite, voir rapport final).
-- ----------------------------------------------------------------------------
create or replace function notify_join_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, community_id, target_type, target_id)
  select cm.profile_id, 'join_request_received', new.profile_id, new.community_id, 'join_request', new.id
  from community_members cm where cm.community_id = new.community_id and cm.role in ('owner','admin');
  return new;
end; $$;
drop trigger if exists trg_notify_join_request on community_join_requests;
create trigger trg_notify_join_request after insert on community_join_requests
for each row execute function notify_join_request();

create or replace function notify_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invited_profile_id is not null then
    insert into notifications (recipient_id, type, actor_id, community_id, target_type, target_id)
    values (new.invited_profile_id, 'invite_received', new.invited_by, new.community_id, 'invite', new.id);
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_invite on community_invites;
create trigger trg_notify_invite after insert on community_invites
for each row execute function notify_invite();

create or replace function notify_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, community_id, target_type, target_id)
  select cm.profile_id, 'report_received', new.from_id, new.community_id, 'report', new.id
  from community_members cm where cm.community_id = new.community_id and cm.role in ('owner','admin','moderator');
  return new;
end; $$;
drop trigger if exists trg_notify_report on community_reports;
create trigger trg_notify_report after insert on community_reports
for each row execute function notify_report();

-- ----------------------------------------------------------------------------
-- 12. Relation propre pour un futur système d'événements de communauté
-- (item 24 : préparer seulement, ne pas construire le système complet).
-- ----------------------------------------------------------------------------
alter table events add column if not exists community_id uuid references communities(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename from pg_tables where schemaname='public' and tablename like 'community%' or tablename='notifications';
-- select proname from pg_proc where proname in ('create_community','accept_join_request','reject_join_request','accept_invite');
-- select policyname, cmd from pg_policies where tablename like 'community%' order by tablename, cmd;
-- ============================================================================
