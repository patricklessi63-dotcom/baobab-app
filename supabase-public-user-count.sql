-- ============================================================================
-- Nombre d'utilisateurs sur la page d'accueil publique (non connectée).
-- À exécuter dans Supabase : SQL Editor (une fois).
-- ============================================================================
-- "profiles" est restreint en lecture au role "authenticated" (Phase 10 —
-- supabase-scale-security.sql) : un visiteur non connecté ne peut lire
-- aucune ligne, donc pas non plus en compter le nombre directement. RPC
-- security definer qui ne renvoie QU'un compte (aucune donnée de profil),
-- ouverte au role "anon" — safe car aucune information personnelle exposée.
create or replace function public_user_count()
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*) from profiles;
$$;

revoke all on function public_user_count() from public;
grant execute on function public_user_count() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname from pg_proc where proname = 'public_user_count';
-- ============================================================================
