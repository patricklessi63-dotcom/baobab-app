-- ============================================================================
-- Phase 12a — Baobab Launch & Growth 🚀🌍 (onboarding rapide, activation).
-- À exécuter dans Supabase : SQL Editor (une fois), après supabase-follows.sql
-- et supabase-scale-security-2.sql (fournit current_profile_id() et l'index
-- style le plus récent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nouveau champ "objectif d'usage" — additif, volontairement séparé de
-- "looking_for" (7 options romantiques, poids 30/100 dans le matching). Ce
-- nouveau champ sert uniquement à personnaliser l'expérience post-onboarding
-- (quel onglet du fil ouvrir en premier), jamais le score de matching.
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists usage_goals text;

-- ----------------------------------------------------------------------------
-- 2. Décalage d'une position pour les comptes en cours d'onboarding (une
-- nouvelle étape 1 "Bienvenue" est insérée avant l'ancienne étape 1). Ne
-- touche que les comptes pas encore terminés (onboarding_completed_at
-- toujours null) — aucun impact sur les comptes déjà onboardés. À exécuter
-- une seule fois.
-- ----------------------------------------------------------------------------
update profiles set onboarding_step = onboarding_step + 1
where onboarding_completed_at is null and onboarding_step is not null and onboarding_step > 0;

-- ----------------------------------------------------------------------------
-- 3. analytics_events — journal minimal d'activation, aucun service tiers.
-- Motif "follows" (auto-insertion, profile_id = current_profile_id()
-- toujours) plutôt que le motif "notifications" (serveur seul) : ici
-- l'auteur et le sujet de l'événement sont toujours la même personne, donc
-- pas besoin d'un trigger SECURITY DEFINER pour écrire dans la ligne d'un
-- tiers. unique(profile_id, event_type) : ne compte que la 1re occurrence
-- de chaque type par utilisateur (déduplication à l'insertion, pas de
-- vérification côté client nécessaire).
-- ----------------------------------------------------------------------------
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'profile_completed','first_like','first_match','first_message',
    'community_joined','event_joined'
  )),
  created_at timestamptz default now(),
  unique (profile_id, event_type)
);
alter table analytics_events enable row level security;
create index if not exists idx_analytics_events_type_created on analytics_events(event_type, created_at);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'analytics_events' loop
    execute format('drop policy %I on public.analytics_events', pol.policyname);
  end loop;

  create policy "Un utilisateur enregistre ses propres evenements"
  on analytics_events for insert
  to authenticated
  with check (profile_id = current_profile_id());

  -- Pas de policy SELECT côté client — journal destiné à un futur tableau
  -- de bord admin (chantier séparé, nécessite d'abord de définir un rôle
  -- "admin plateforme" qui n'existe pas encore), pas une donnée que
  -- l'utilisateur consulte lui-même.
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns where table_name='profiles' and column_name='usage_goals';
-- select tablename from pg_tables where schemaname='public' and tablename='analytics_events';
-- select policyname, cmd from pg_policies where tablename='analytics_events';
-- ============================================================================
