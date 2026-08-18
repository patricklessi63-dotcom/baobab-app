-- ============================================================================
-- Phase 8 — Baobab Premium. A executer dans Supabase : SQL Editor (une fois),
-- APRES supabase-communities.sql (deja en production, fournit current_profile_id()).
-- ============================================================================
-- Le statut Premium n'est JAMAIS une colonne sur "profiles" — impossible a
-- falsifier depuis le client puisqu'elle n'existe pas. Il est calcule a la
-- volee depuis "subscriptions", une table que seule l'Edge Function webhook
-- (cle service_role, contourne totalement la RLS) peut ecrire. Aucune
-- policy INSERT/UPDATE/DELETE cliente sur les deux tables ci-dessous —
-- c'est la garantie centrale de cette migration.

-- ----------------------------------------------------------------------------
-- 1. subscriptions — un historique de lignes par profil (pas juste la
-- derniere), pour garder une trace si un utilisateur change de plan ou
-- resouscrit apres annulation.
-- ----------------------------------------------------------------------------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text check (plan in ('monthly','yearly')),
  -- Liste complete des statuts reels renvoyes par Stripe (pas seulement
  -- ceux qu'on s'attend a voir) pour qu'un evenement webhook legitime ne
  -- puisse jamais echouer a l'ecriture faute de valeur autorisee.
  status text not null check (status in ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;

create index if not exists idx_subscriptions_profile on subscriptions(profile_id);
create index if not exists idx_subscriptions_customer on subscriptions(stripe_customer_id);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='subscriptions' loop
    execute format('drop policy %I on public.subscriptions', pol.policyname);
  end loop;

  create policy "Lire son propre abonnement"
  on subscriptions for select using (profile_id = current_profile_id());

  -- Aucune policy INSERT/UPDATE/DELETE : seule l'Edge Function webhook
  -- (service_role, hors RLS) peut ecrire ici. Un utilisateur ne peut
  -- jamais s'attribuer lui-meme un statut Premium.
end $$;

-- ----------------------------------------------------------------------------
-- 2. subscription_events — journal des evenements Stripe traites, avec
-- deduplication (Stripe peut renvoyer le meme evenement plusieurs fois).
-- ----------------------------------------------------------------------------
create table if not exists subscription_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  stripe_event_id text unique not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz default now()
);
alter table subscription_events enable row level security;

create index if not exists idx_subscription_events_profile on subscription_events(profile_id);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='subscription_events' loop
    execute format('drop policy %I on public.subscription_events', pol.policyname);
  end loop;

  create policy "Lire ses propres evenements d'abonnement"
  on subscription_events for select using (profile_id = current_profile_id());

  -- Aucune policy INSERT/UPDATE/DELETE cliente — memes raisons que ci-dessus.
end $$;

-- ----------------------------------------------------------------------------
-- 3. Fonction centralisee is_premium() — seule source de verite reutilisable
-- par une future policy RLS ayant besoin de savoir si un profil est Premium.
-- ----------------------------------------------------------------------------
create or replace function is_premium(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subscriptions
    where profile_id = p_profile_id
      and status in ('active', 'trialing')
      and (current_period_end is null or current_period_end > now())
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. Notifications — extension de la table generique existante (Phase 6),
-- aucune nouvelle table de notification.
-- ----------------------------------------------------------------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'join_request_received','join_request_accepted','invite_received','report_received',
  'event_invite','event_participation_confirmed','event_updated','event_cancelled',
  'event_reminder_24h','event_reminder_1h','event_report_received','event_waitlist_promoted',
  'premium_activated','premium_payment_failed','premium_cancelled','premium_renewing_soon'
));

-- ----------------------------------------------------------------------------
-- Verification (facultatif, a executer separement apres) :
-- select tablename from pg_tables where schemaname='public' and tablename like 'subscription%';
-- select proname from pg_proc where proname = 'is_premium';
-- select policyname, cmd from pg_policies where tablename in ('subscriptions','subscription_events');
-- ============================================================================
