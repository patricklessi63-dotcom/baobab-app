-- ============================================================================
-- SQL-37 — Droits Premium vérifiés côté serveur + statistiques d'abonnement (administration).
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 5 novembre 2026. Fondation du chantier « Baobab Premium » (phase P0) : aucun comportement
-- visible ne change tant que rien ne s'en sert ; c'est le point d'appui des avantages à venir.
--
-- CE QUE LE FICHIER AJOUTE (additif : aucune table, policy ou fonction existante modifiée) :
--   1. premium_entitlements : le catalogue des avantages Premium RÉELLEMENT livrés (clé, libellé,
--      actif oui/non). Lecture par les comptes connectés ; AUCUNE policy d'écriture : seul le
--      propriétaire (éditeur SQL / service_role) le modifie. Trois lignes au départ, celles qui existent
--      déjà dans l'application : advanced_filters, admirers_reveal, premium_badge.
--   2. has_premium_feature(profil, clé) : vrai si le profil est Premium (is_premium(), SQL-Premium :
--      statut active/trialing ET période non échue) ET que l'avantage est actif au catalogue. C'est la
--      brique à utiliser dans les futures policies RLS / triggers, jamais un indicateur du client.
--      Résiliation ou expiration ⇒ l'accès tombe seul (is_premium() ne regarde que la table
--      subscriptions, que seul le webhook Stripe écrit).
--   3. admin_premium_stats() : statistiques d'abonnement pour le tableau de bord administrateur,
--      calculées sur la table subscriptions (alimentée par le webhook Stripe) et sur profiles.
--      Réservée aux administrateurs (is_admin_or_above()). AUCUN montant en dollars : subscriptions ne
--      stocke pas les prix ; Stripe fait foi pour les revenus. Le tableau de bord pourra afficher une
--      estimation « abonnés × prix affiché », clairement étiquetée comme telle.
--
-- PRÉREQUIS : supabase-premium.sql (is_premium, subscriptions), supabase-admin.sql (is_admin_or_above).
-- Le fichier s'arrête avec un message clair si l'un manque.
--
-- DÉPLOIEMENT : aucun changement de client requis.
--
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule) :
--   select key, active from premium_entitlements order by key;            -- 3 lignes, active = true
--   select has_premium_feature(null, 'advanced_filters');                 -- false (aucun profil)
--   select polname, polcmd from pg_policy where polrelid = 'public.premium_entitlements'::regclass;
--     -- attendu : une seule policy, SELECT (polcmd = 'r')
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon
--   from pg_proc p where p.proname in ('has_premium_feature','admin_premium_stats');   -- anon = false
--
-- RETOUR ARRIÈRE :
--   drop function if exists public.admin_premium_stats();
--   drop function if exists public.has_premium_feature(uuid, text);
--   drop table if exists public.premium_entitlements;
-- ============================================================================

do $$
begin
  if to_regprocedure('public.is_premium(uuid)') is null then
    raise exception 'is_premium() introuvable : exécuter d''abord supabase-premium.sql';
  end if;
  if to_regprocedure('public.is_admin_or_above()') is null then
    raise exception 'is_admin_or_above() introuvable : exécuter d''abord supabase-admin.sql';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Catalogue des avantages Premium
-- ----------------------------------------------------------------------------
create table if not exists public.premium_entitlements (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(label) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.premium_entitlements enable row level security;

drop policy if exists "premium_entitlements_select" on public.premium_entitlements;
create policy "premium_entitlements_select" on public.premium_entitlements
  for select to authenticated using (true);
-- Aucune policy INSERT/UPDATE/DELETE : un compte ne peut pas s'attribuer un avantage.

revoke all on public.premium_entitlements from anon;
revoke insert, update, delete, truncate on public.premium_entitlements from authenticated;
grant select on public.premium_entitlements to authenticated;

insert into public.premium_entitlements (key, label) values
  ('advanced_filters', 'Filtres de recherche avancés'),
  ('admirers_reveal',  'Voir qui t''a aimé·e en premier'),
  ('premium_badge',    'Badge Premium sur le profil')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. has_premium_feature(profil, clé)
-- ----------------------------------------------------------------------------
create or replace function public.has_premium_feature(p_profile_id uuid, p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_premium(p_profile_id), false)
     and exists (select 1 from public.premium_entitlements e where e.key = p_key and e.active);
$$;

revoke all on function public.has_premium_feature(uuid, text) from public, anon;
grant execute on function public.has_premium_feature(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Statistiques d'abonnement (administrateurs seulement)
--    « Premium » = même définition que is_premium() : statut active/trialing et période non échue.
--    Un profil peut avoir plusieurs lignes d'historique : on compte des PROFILS distincts.
-- ----------------------------------------------------------------------------
create or replace function public.admin_premium_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_members bigint;
  v_premium bigint;
  v_result jsonb;
begin
  if not public.is_admin_or_above() then raise exception 'Non autorise'; end if;

  select count(*) into v_members from public.profiles;

  with cur as (
    select s.*
    from public.subscriptions s
    where s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  )
  select count(distinct profile_id) into v_premium from cur;

  with cur as (
    select s.*
    from public.subscriptions s
    where s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  )
  select jsonb_build_object(
    'members_total',      v_members,
    'premium_total',      v_premium,
    'trialing',           (select count(distinct profile_id) from cur where status = 'trialing'),
    'paid',               (select count(distinct profile_id) from cur where status = 'active'),
    'monthly',            (select count(distinct profile_id) from cur where plan = 'monthly'),
    'yearly',             (select count(distinct profile_id) from cur where plan = 'yearly'),
    'cancel_scheduled',   (select count(distinct profile_id) from cur where cancel_at_period_end),
    'past_due',           (select count(distinct profile_id) from public.subscriptions where status = 'past_due'),
    'new_last_30_days',   (select count(distinct profile_id) from public.subscriptions where created_at > now() - interval '30 days'),
    -- Résiliations réelles : abonnement résilié dans les 30 jours ET profil pas (re)devenu Premium depuis.
    'canceled_last_30_days', (select count(distinct s.profile_id) from public.subscriptions s
                              where s.status = 'canceled' and s.updated_at > now() - interval '30 days'
                                and s.profile_id not in (select profile_id from cur)),
    'conversion_percent', case when v_members > 0 then round(100.0 * v_premium / v_members, 1) else 0 end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_premium_stats() from public, anon;
grant execute on function public.admin_premium_stats() to authenticated;
