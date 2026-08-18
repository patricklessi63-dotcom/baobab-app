-- ============================================================================
-- Phase 9 — Baobab Intelligence. A executer dans Supabase : SQL Editor
-- (une fois), APRES supabase-communities.sql (current_profile_id()) et
-- supabase-events-v2.sql (event_invitations, pour le signal anti-spam).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reglages de personnalisation (additif sur profiles, deja modifiable
-- par l'utilisateur via le motif handleToggleField existant).
-- ----------------------------------------------------------------------------
alter table profiles
  add column if not exists personalization_enabled boolean not null default true,
  add column if not exists ai_suggestions_enabled boolean not null default true;

-- ----------------------------------------------------------------------------
-- 2. hidden_recommendations — "masquer" une personne/communaute/evenement
-- recommande. Meme motif que "favorites"/"blocks" (self -> target).
-- ----------------------------------------------------------------------------
create table if not exists hidden_recommendations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile','community','event')),
  target_id uuid not null,
  created_at timestamptz default now(),
  unique (profile_id, target_type, target_id)
);
alter table hidden_recommendations enable row level security;
create index if not exists idx_hidden_recommendations_profile on hidden_recommendations(profile_id, target_type);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='hidden_recommendations' loop
    execute format('drop policy %I on public.hidden_recommendations', pol.policyname);
  end loop;

  create policy "Gerer ses propres recommandations masquees"
  on hidden_recommendations for all
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- 3. recommendation_feedback — "ces suggestions te conviennent-elles ?".
-- Enregistre honnetement ; pas encore consomme pour re-classer en direct
-- (voir rapport final — Phase 10).
-- ----------------------------------------------------------------------------
create table if not exists recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile','community','event')),
  target_id uuid,
  helpful boolean not null,
  reason text,
  created_at timestamptz default now()
);
alter table recommendation_feedback enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='recommendation_feedback' loop
    execute format('drop policy %I on public.recommendation_feedback', pol.policyname);
  end loop;

  create policy "Gerer son propre feedback"
  on recommendation_feedback for all
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- 4. ai_usage — journal des appels IA, pour le rate limiting reel cote
-- serveur (item 28). Ecrit uniquement par l'Edge Function ai-assist
-- (cle service_role) — aucune policy INSERT cliente, meme motif que
-- subscription_events en Phase 8.
-- ----------------------------------------------------------------------------
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz default now()
);
alter table ai_usage enable row level security;
create index if not exists idx_ai_usage_profile_time on ai_usage(profile_id, created_at);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='ai_usage' loop
    execute format('drop policy %I on public.ai_usage', pol.policyname);
  end loop;

  create policy "Lire son propre usage IA"
  on ai_usage for select using (profile_id = current_profile_id());
  -- Aucune policy INSERT/UPDATE/DELETE cliente.
end $$;

-- ----------------------------------------------------------------------------
-- 5. user_risk_level() — score de risque deterministe (item 21-23).
-- Signaux reels uniquement, jamais de 'blocked' automatique : ce projet
-- n'a aucun panneau d'administration global pour superviser une action
-- automatique de ce niveau (les roles staff sont scopes a une communaute/
-- un evenement, pas a la plateforme) — cette fonction est une brique de
-- scoring prete, pas encore consommee par une UI (voir rapport final).
-- ----------------------------------------------------------------------------
create or replace function user_risk_level(p_profile_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_recent_messages int;
  v_repeated_messages int;
  v_recent_invitations int;
  v_incomplete_and_active boolean;
  v_signal_count int := 0;
begin
  -- Rafale de messages (frequence).
  select count(*) into v_recent_messages from messages
    where from_id = p_profile_id and created_at > now() - interval '5 minutes';
  if v_recent_messages >= 20 then v_signal_count := v_signal_count + 1; end if;

  -- Messages textuels identiques repetes (comportement automatise).
  select count(*) into v_repeated_messages from (
    select text from messages
    where from_id = p_profile_id and kind = 'text' and created_at > now() - interval '30 minutes'
    group by text having count(*) >= 5
  ) dup;
  if v_repeated_messages > 0 then v_signal_count := v_signal_count + 1; end if;

  -- Invitations d'evenement en masse (proche du seuil anti-spam deja
  -- applique par le trigger de supabase-events-v2.sql).
  select count(*) into v_recent_invitations from event_invitations
    where invited_by = p_profile_id and created_at > now() - interval '24 hours';
  if v_recent_invitations >= 25 then v_signal_count := v_signal_count + 1; end if;

  -- Profil quasi vide mais deja tres actif en messagerie — motif classique
  -- de compte cree pour spammer plutot que pour se connecter.
  select (coalesce(bio, '') = '' and coalesce(interests, '') = '' and created_at > now() - interval '1 hour')
    into v_incomplete_and_active from profiles where id = p_profile_id;
  if coalesce(v_incomplete_and_active, false) and v_recent_messages >= 10 then
    v_signal_count := v_signal_count + 1;
  end if;

  if v_signal_count >= 2 then return 'limited';
  elsif v_signal_count = 1 then return 'suspect';
  else return 'normal';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Verification (facultatif, a executer separement apres) :
-- select column_name from information_schema.columns where table_name='profiles' and column_name in ('personalization_enabled','ai_suggestions_enabled');
-- select tablename from pg_tables where schemaname='public' and tablename in ('hidden_recommendations','recommendation_feedback','ai_usage');
-- select proname from pg_proc where proname = 'user_risk_level';
-- select user_risk_level('<uuid-dun-profil-de-test>');
-- ============================================================================
