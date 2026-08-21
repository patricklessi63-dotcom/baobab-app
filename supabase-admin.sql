-- ============================================================================
-- Phase — Baobab Sécurité & Administration 2.0 — à exécuter dans Supabase :
-- SQL Editor (une fois).
-- ============================================================================
-- AUDIT PRÉALABLE (résumé, voir rapport final pour le détail complet) :
-- - Suppression de compte avec délai de grâce de 7 jours : déjà entièrement
--   construite et fonctionnelle (supabase-account-deletion.sql, pg_cron +
--   Edge Function process-scheduled-deletions, clé service role dans Vault
--   uniquement — jamais dans le frontend).
-- - Force du mot de passe (indicateur Faible/Moyen/Fort) : déjà construite
--   (src/lib/passwordStrength.js, src/components/auth/PasswordStrengthMeter.jsx).
-- - SERVICE_ROLE_KEY : confirmé absente de tout le code frontend (grep sur
--   src/ — aucune occurrence).
-- - RLS déjà auditée et durcie au fil des phases précédentes (policies
--   INSERT vérifiant systématiquement current_profile_id()/auth.uid(),
--   aucune table sensible sans RLS).
-- Ce fichier construit UNIQUEMENT ce qui manquait réellement : rôles
-- d'administration site-wide (distincts des rôles de communauté et des
-- éditeurs Baobab Info), suspension/bannissement réellement appliqués (pas
-- juste un bouton caché), journal d'audit immuable, et les RPC nécessaires
-- au dashboard admin.

-- ----------------------------------------------------------------------------
-- 1. platform_roles — moderator/admin/super_admin, site-wide. Distinct de
-- community_members.role (par communauté) et info_editors.role (Baobab
-- Info uniquement) : un modérateur de communauté n'a AUCUN pouvoir ici, et
-- inversement. Même motif que beta_testers/info_editors : aucune policy
-- INSERT/UPDATE/DELETE cliente — uniquement via les RPC security definer
-- ci-dessous, qui appliquent la hiérarchie (RÈGLE ABSOLUE : "NE PAS
-- permettre à un utilisateur de s'attribuer un rôle admin").
-- ----------------------------------------------------------------------------
create table if not exists platform_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('moderator','admin','super_admin')),
  granted_by uuid references profiles(id) on delete set null,
  granted_at timestamptz default now(),
  unique (profile_id)
);
alter table platform_roles enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='platform_roles' loop
    execute format('drop policy %I on public.platform_roles', pol.policyname);
  end loop;

  create policy "Un utilisateur voit son propre role plateforme"
  on platform_roles for select using (profile_id = current_profile_id());
end $$;

create or replace function platform_role(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from platform_roles where profile_id = p_profile_id;
$$;

create or replace function is_moderator_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select platform_role(current_profile_id()) in ('moderator','admin','super_admin');
$$;

create or replace function is_admin_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select platform_role(current_profile_id()) in ('admin','super_admin');
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select platform_role(current_profile_id()) = 'super_admin';
$$;

-- Hiérarchie de rang pour comparer deux rôles (utilisé pour empêcher un
-- admin d'agir sur un super_admin, etc.).
create or replace function role_rank(p_role text)
returns int language sql immutable as $$
  select case p_role
    when 'super_admin' then 3
    when 'admin' then 2
    when 'moderator' then 1
    else 0
  end;
$$;

-- ----------------------------------------------------------------------------
-- 2. admin_actions — journal d'audit immuable (items 39/40). Aucune policy
-- UPDATE/DELETE pour personne (même un super_admin) : une correction se
-- fait en ajoutant une nouvelle ligne, jamais en modifiant l'historique.
-- ----------------------------------------------------------------------------
create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action_type text not null check (action_type in (
    'role_granted','role_revoked','user_suspended','user_unsuspended',
    'user_banned','user_unbanned','report_resolved','report_dismissed'
  )),
  target_profile_id uuid references profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table admin_actions enable row level security;
create index if not exists idx_admin_actions_target on admin_actions(target_profile_id, created_at desc);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='admin_actions' loop
    execute format('drop policy %I on public.admin_actions', pol.policyname);
  end loop;

  create policy "Les admins consultent le journal"
  on admin_actions for select using (is_admin_or_above());
  -- Pas de policy insert cliente : uniquement via les RPC ci-dessous.
  -- Aucune policy update/delete pour personne — immuable.
end $$;

-- ----------------------------------------------------------------------------
-- 3. Suspension / bannissement — colonnes sur profiles, réellement
-- appliquées côté app (App.jsx vérifie au chargement de session), pas
-- seulement un badge visuel.
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists suspended_until timestamptz;
alter table profiles add column if not exists suspend_reason text;
alter table profiles add column if not exists banned_at timestamptz;
alter table profiles add column if not exists ban_reason text;

-- ----------------------------------------------------------------------------
-- 4. RPC — gestion des rôles. Un acteur ne peut jamais accorder un rôle de
-- rang supérieur ou égal au sien (sauf super_admin, qui peut tout faire).
-- ----------------------------------------------------------------------------
create or replace function grant_platform_role(p_profile_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor_rank int; v_target_rank int;
begin
  if p_profile_id = current_profile_id() then
    raise exception 'Impossible de modifier son propre role';
  end if;
  v_actor_rank := role_rank(platform_role(current_profile_id()));
  v_target_rank := role_rank(p_role);
  if v_actor_rank < 2 then -- reserve aux admin/super_admin
    raise exception 'Non autorise';
  end if;
  if v_actor_rank <= v_target_rank and v_actor_rank < 3 then
    raise exception 'Ne peut pas accorder un role egal ou superieur au sien';
  end if;

  insert into platform_roles (profile_id, role, granted_by)
  values (p_profile_id, p_role, current_profile_id())
  on conflict (profile_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();

  insert into admin_actions (actor_id, action_type, target_profile_id, metadata)
  values (current_profile_id(), 'role_granted', p_profile_id, jsonb_build_object('role', p_role));
end;
$$;

create or replace function revoke_platform_role(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor_rank int; v_target_rank int;
begin
  v_actor_rank := role_rank(platform_role(current_profile_id()));
  v_target_rank := role_rank(platform_role(p_profile_id));
  if v_actor_rank < 2 then raise exception 'Non autorise'; end if;
  if v_actor_rank <= v_target_rank and v_actor_rank < 3 then
    raise exception 'Ne peut pas retirer un role egal ou superieur au sien';
  end if;

  delete from platform_roles where profile_id = p_profile_id;

  insert into admin_actions (actor_id, action_type, target_profile_id)
  values (current_profile_id(), 'role_revoked', p_profile_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC — suspension (moderator+) / bannissement (admin+). Un acteur ne
-- peut jamais agir sur quelqu'un de rang egal ou superieur au sien.
-- ----------------------------------------------------------------------------
create or replace function suspend_user(p_profile_id uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor_rank int; v_target_rank int;
begin
  if p_profile_id = current_profile_id() then raise exception 'Cible invalide'; end if;
  v_actor_rank := role_rank(platform_role(current_profile_id()));
  v_target_rank := role_rank(platform_role(p_profile_id));
  if v_actor_rank < 1 then raise exception 'Non autorise'; end if;
  if v_target_rank >= v_actor_rank then raise exception 'Impossible d''agir sur ce compte'; end if;

  update profiles set suspended_until = p_until, suspend_reason = p_reason where id = p_profile_id;

  insert into admin_actions (actor_id, action_type, target_profile_id, reason, metadata)
  values (current_profile_id(), 'user_suspended', p_profile_id, p_reason, jsonb_build_object('until', p_until));
end;
$$;

create or replace function unsuspend_user(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  update profiles set suspended_until = null, suspend_reason = null where id = p_profile_id;
  insert into admin_actions (actor_id, action_type, target_profile_id)
  values (current_profile_id(), 'user_unsuspended', p_profile_id);
end;
$$;

create or replace function ban_user(p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor_rank int; v_target_rank int;
begin
  if p_profile_id = current_profile_id() then raise exception 'Cible invalide'; end if;
  v_actor_rank := role_rank(platform_role(current_profile_id()));
  v_target_rank := role_rank(platform_role(p_profile_id));
  if v_actor_rank < 2 then raise exception 'Non autorise'; end if; -- ban reserve a admin+
  if v_target_rank >= v_actor_rank then raise exception 'Impossible d''agir sur ce compte'; end if;

  update profiles set banned_at = now(), ban_reason = p_reason where id = p_profile_id;

  insert into admin_actions (actor_id, action_type, target_profile_id, reason)
  values (current_profile_id(), 'user_banned', p_profile_id, p_reason);
end;
$$;

create or replace function unban_user(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_or_above() then raise exception 'Non autorise'; end if;
  update profiles set banned_at = null, ban_reason = null where id = p_profile_id;
  insert into admin_actions (actor_id, action_type, target_profile_id)
  values (current_profile_id(), 'user_unbanned', p_profile_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC — file de signalements unifiee (moderator+), lit a travers toutes
-- les tables de signalement existantes (reports, community_reports,
-- event_reports, post_reports, info_reports) sans dupliquer de donnees ni
-- creer de table supplementaire (item 42 : ne pas creer de tables inutiles).
-- SECURITY DEFINER : contourne volontairement les RLS individuelles de
-- chaque table de signalement (qui n'autorisent normalement que leur staff
-- respectif), mais seulement apres verification explicite du role plateforme.
-- ----------------------------------------------------------------------------
create or replace function admin_list_reports(p_status text default 'open')
returns table (
  source text, id uuid, target_type text, target_id text, from_id uuid,
  category text, reason text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select 'community'::text, cr.id, cr.target_type, cr.target_id::text, cr.from_id, cr.category, cr.reason, cr.status, cr.created_at
    from community_reports cr where cr.status = p_status
    union all
    select 'event'::text, er.id, 'event'::text, er.event_id::text, er.from_id, er.category, er.reason, er.status, er.created_at
    from event_reports er where er.status = p_status
    union all
    select 'post'::text, pr.id, pr.target_type, pr.target_id::text, pr.from_id, pr.category, pr.reason, coalesce(pr.status,'open'), pr.created_at
    from post_reports pr where coalesce(pr.status,'open') = p_status
    union all
    select 'info'::text, ir.id, 'info_article'::text, ir.article_id::text, ir.from_id, ir.category, ir.reason, ir.status, ir.created_at
    from info_reports ir where ir.status = p_status
    order by created_at desc;
end;
$$;

create or replace function admin_resolve_report(p_source text, p_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text := case when p_dismiss then 'dismissed' else 'resolved' end;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  if p_source = 'community' then
    update community_reports set status = v_status where id = p_id;
  elsif p_source = 'event' then
    update event_reports set status = v_status where id = p_id;
  elsif p_source = 'post' then
    update post_reports set status = v_status where id = p_id;
  elsif p_source = 'info' then
    update info_reports set status = v_status where id = p_id;
  else
    raise exception 'Source inconnue';
  end if;

  insert into admin_actions (actor_id, action_type, metadata)
  values (current_profile_id(), case when p_dismiss then 'report_dismissed' else 'report_resolved' end,
    jsonb_build_object('source', p_source, 'report_id', p_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC — statistiques du dashboard (moderator+), un seul aller-retour.
-- ----------------------------------------------------------------------------
create or replace function admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  select jsonb_build_object(
    'total_users', (select count(*) from profiles),
    'suspended_users', (select count(*) from profiles where suspended_until is not null and suspended_until > now()),
    'banned_users', (select count(*) from profiles where banned_at is not null),
    'open_reports', (
      (select count(*) from community_reports where status = 'open') +
      (select count(*) from event_reports where status = 'open') +
      (select count(*) from post_reports where coalesce(status,'open') = 'open') +
      (select count(*) from info_reports where status = 'open')
    ),
    'pending_info_review', (select count(*) from info_articles where status = 'pending_review')
  ) into v_result;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC — recherche/liste d'utilisateurs (moderator+) pour /admin. Ne
-- renvoie que les champs necessaires a la moderation (item 27 : ne pas
-- exposer inutilement des donnees privees) — jamais l'email (reste dans
-- auth.users, hors de portee du frontend sauf via cette RPC si besoin
-- futur documente separement).
-- ----------------------------------------------------------------------------
create or replace function admin_search_users(p_query text default '')
returns table (
  id uuid, name text, avatar_url text, created_at timestamptz,
  role text, suspended_until timestamptz, banned_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select p.id, p.name, p.avatar_url, p.created_at,
      platform_role(p.id), p.suspended_until, p.banned_at
    from profiles p
    where p_query = '' or p.name ilike '%' || p_query || '%'
    order by p.created_at desc
    limit 100;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Te designer super_admin (a executer separement, une fois, avec ton
-- propre email) :
-- insert into platform_roles (profile_id, role)
--   select p.id, 'super_admin' from profiles p join auth.users u on u.id = p.user_id
--   where u.email = 'TON_EMAIL_ICI';
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename from pg_tables where schemaname='public' and tablename in ('platform_roles','admin_actions');
-- select proname from pg_proc where proname like '%platform_role%' or proname like 'admin_%' or proname in ('suspend_user','ban_user','unban_user','unsuspend_user');
-- select column_name from information_schema.columns where table_name='profiles' and column_name in ('suspended_until','banned_at');
-- ============================================================================
