-- ============================================================================
-- Phase 2 — Beta privée : événements + feedback. À exécuter dans Supabase :
-- SQL Editor. Additif uniquement, aucun impact sur les tables existantes
-- (séparé de "analytics_events" qui reste dédié aux jalons uniques par
-- profil — ces deux nouvelles tables acceptent des événements répétés).
-- ============================================================================

create table if not exists beta_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  meta jsonb,
  created_at timestamptz default now()
);
alter table beta_events enable row level security;
create index if not exists idx_beta_events_type_created on beta_events(event_type, created_at);
create index if not exists idx_beta_events_profile on beta_events(profile_id);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'beta_events' loop
    execute format('drop policy %I on public.beta_events', pol.policyname);
  end loop;

  create policy "Un utilisateur enregistre ses propres evenements beta"
  on beta_events for insert
  to authenticated
  with check (profile_id = current_profile_id());
end $$;

create table if not exists beta_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  screen text,
  created_at timestamptz default now()
);
alter table beta_feedback enable row level security;
create index if not exists idx_beta_feedback_created on beta_feedback(created_at);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'beta_feedback' loop
    execute format('drop policy %I on public.beta_feedback', pol.policyname);
  end loop;

  create policy "Un utilisateur envoie son propre feedback"
  on beta_feedback for insert
  to authenticated
  with check (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename from pg_tables where schemaname='public' and tablename in ('beta_events','beta_feedback');
-- select tablename, policyname, cmd from pg_policies where tablename in ('beta_events','beta_feedback');
--
-- Consultation en tant que propriétaire (Dashboard > Table Editor ou SQL
-- Editor, avec le rôle postgres qui contourne RLS) :
-- select event_type, count(*) from beta_events group by event_type order by 2 desc;
-- select bf.created_at, p.name, bf.screen, bf.message from beta_feedback bf join profiles p on p.id = bf.profile_id order by bf.created_at desc;
-- ============================================================================
