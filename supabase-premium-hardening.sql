-- ============================================================================
-- SQL-41 — Durcissement de SQL-38 (collections privées) et de SQL-39 (ai_usage), issu de l'audit du
-- 12 novembre 2026 (rejeu sur la répétition, AUDIT-COMPLET-2026-11.md).
--
-- LIVRÉ le 12/11/2026. Additif : aucune table supprimée, aucune donnée modifiée.
--
-- CE QUE LE FICHIER FAIT :
--   1. Un compte SUSPENDU ou BANNI ne peut plus créer de collection ni y ranger une publication
--      (policies RESTRICTIVES d'INSERT, comme pour les j'aime et les messages). Lire, retirer et supprimer
--      ses propres lignes reste permis. Helper is_account_restricted(profil), SECURITY DEFINER, qui ne
--      répond que pour le compte connecté lui-même (pas d'espionnage de l'état d'un autre compte).
--   2. Ranger une publication exige qu'elle soit VISIBLE par l'appelant (la RLS de lecture de `posts`
--      s'applique dans la sous-requête) : une publication masquée par un blocage et une publication
--      inexistante donnent le même refus, donc plus de déduction de l'existence d'une publication cachée.
--   3. ai_usage : les comptes connectés ne gardent que la lecture de leur propre consommation, et `anon`
--      n'a plus aucun privilège (l'Edge Function écrit avec la clé de service, qui n'est pas concernée).
--      Hygiène en profondeur : la RLS l'empêchait déjà, mais un privilège de table inutile est une
--      dépendance de plus à une policy.
--
-- PRÉREQUIS : SQL-37 et SQL-38 (supabase-premium-entitlements.sql, supabase-premium-collections.sql),
-- colonnes profiles.banned_at / suspended_until (supabase-admin.sql). Le fichier s'arrête avec un message
-- clair sinon.
--
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule) :
--   select polname, polpermissive from pg_policy where polrelid in
--     ('public.post_collections'::regclass, 'public.post_collection_items'::regclass) order by 1;
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'ai_usage' and grantee in ('anon', 'authenticated');   -- authenticated : SELECT seul
--
-- RETOUR ARRIÈRE :
--   drop policy if exists "post_collections_not_restricted" on public.post_collections;
--   drop policy if exists "post_collection_items_not_restricted" on public.post_collection_items;
--   drop function if exists public.is_account_restricted(uuid);
--   (remettre l'ancienne policy "post_collection_items_insert_premium" de SQL-38 ; privilèges ai_usage : grant …)
-- ============================================================================

do $$
begin
  if to_regclass('public.post_collections') is null or to_regclass('public.post_collection_items') is null then
    raise exception 'collections introuvables : exécuter d''abord supabase-premium-collections.sql (SQL-38)';
  end if;
  if to_regprocedure('public.has_premium_feature(uuid,text)') is null then
    raise exception 'has_premium_feature() introuvable : exécuter d''abord SQL-37';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'banned_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_until') then
    raise exception 'profiles.banned_at / suspended_until introuvables : exécuter d''abord supabase-admin.sql';
  end if;
end $$;

-- 1. Helper : le compte est-il suspendu ou banni ? Ne répond que pour soi-même.
create or replace function public.is_account_restricted(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    p_profile_id is not distinct from public.current_profile_id()
    and exists (
      select 1 from public.profiles p
      where p.id = p_profile_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    ), false);
$$;
revoke all on function public.is_account_restricted(uuid) from public, anon;
grant execute on function public.is_account_restricted(uuid) to authenticated;

-- Restrictives : s'ajoutent (ET) aux policies d'INSERT de SQL-38.
drop policy if exists "post_collections_not_restricted" on public.post_collections;
create policy "post_collections_not_restricted" on public.post_collections
  as restrictive for insert to authenticated
  with check (not public.is_account_restricted(owner_id));

drop policy if exists "post_collection_items_not_restricted" on public.post_collection_items;
create policy "post_collection_items_not_restricted" on public.post_collection_items
  as restrictive for insert to authenticated
  with check (not public.is_account_restricted(owner_id));

-- 2. Ranger exige une publication visible par l'appelant (la RLS de `posts` s'applique ici).
drop policy if exists "post_collection_items_insert_premium" on public.post_collection_items;
create policy "post_collection_items_insert_premium" on public.post_collection_items
  for insert to authenticated
  with check (
    owner_id = public.current_profile_id()
    and public.has_premium_feature(owner_id, 'private_collections')
    and exists (select 1 from public.post_collections c where c.id = collection_id and c.owner_id = public.current_profile_id())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

-- 3. ai_usage : lecture de sa propre consommation seulement.
do $$
begin
  if to_regclass('public.ai_usage') is not null then
    revoke all on public.ai_usage from anon;
    revoke insert, update, delete, truncate, references, trigger on public.ai_usage from authenticated;
  end if;
end $$;
