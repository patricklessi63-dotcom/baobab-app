-- ============================================================================
-- Phase 11a — Baobab Social Ecosystem 🌍 — système de suivi (follows).
-- À exécuter dans Supabase : SQL Editor (une fois), APRÈS supabase-communities.sql
-- (fournit current_profile_id()) et APRÈS supabase-premium.sql (dernier
-- élargissement en date de notifications_type_check).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table "follows" — même forme que "favorites" (supabase-profile-
-- onboarding.sql) et "blocks" (supabase-matching.sql), avec la contrainte
-- anti-auto-référence posée directement à la création (durcissement
-- appliqué après-coup sur favorites/blocks/likes/passes dans
-- supabase-matching.sql — ici on le fait dès le départ).
-- ----------------------------------------------------------------------------
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references profiles(id) on delete cascade,
  to_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (from_id, to_id),
  constraint follows_no_self_check check (from_id <> to_id)
);
alter table follows enable row level security;

create index if not exists idx_follows_from on follows(from_id);
create index if not exists idx_follows_to on follows(to_id);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'follows' loop
    execute format('drop policy %I on public.follows', pol.policyname);
  end loop;

  -- Qui suit qui est un signal social public (comme sur Twitter/Instagram),
  -- pas une donnée privée comme un blocage — une page "abonnés" doit
  -- pouvoir se lire pour n'importe quel profil. Restreint au rôle
  -- "authenticated" (jamais "anon"), même raisonnement que le correctif
  -- profiles SELECT de la Phase 10 (supabase-scale-security.sql).
  create policy "Lecture des abonnements par les utilisateurs connectes"
  on follows for select
  to authenticated
  using (true);

  create policy "Un utilisateur s'abonne en son propre nom"
  on follows for insert
  with check (
    current_profile_id() = follows.from_id
    and follows.from_id <> follows.to_id
  );

  create policy "Un utilisateur se desabonne en son propre nom"
  on follows for delete
  using (current_profile_id() = follows.from_id);
end $$;

-- ----------------------------------------------------------------------------
-- 2. notifications_type_check — restate complet (16 existants + 1 nouveau),
-- suit le même motif que supabase-events-v2.sql et supabase-premium.sql
-- (chaque élargissement réécrit la liste entière).
-- ----------------------------------------------------------------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'join_request_received','join_request_accepted','invite_received','report_received',
  'event_invite','event_participation_confirmed','event_updated','event_cancelled',
  'event_reminder_24h','event_reminder_1h','event_report_received','event_waitlist_promoted',
  'premium_activated','premium_payment_failed','premium_cancelled','premium_renewing_soon',
  'new_follower'
));

-- ----------------------------------------------------------------------------
-- 3. Trigger de notification — copie exacte du motif notify_event_invite()
-- (supabase-events-v2.sql) : target_type='profile' et target_id=l'id du
-- nouvel abonné (new.from_id), pour que le clic sur la notif ouvre
-- directement son profil public côté client.
-- ----------------------------------------------------------------------------
create or replace function notify_new_follower()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  values (new.to_id, 'new_follower', new.from_id, 'profile', new.from_id);
  return new;
end; $$;
drop trigger if exists trg_notify_new_follower on follows;
create trigger trg_notify_new_follower after insert on follows
for each row execute function notify_new_follower();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd from pg_policies where tablename = 'follows';
-- select conname from pg_constraint where conname in ('follows_no_self_check','notifications_type_check');
-- select proname from pg_proc where proname = 'notify_new_follower';
-- ============================================================================
