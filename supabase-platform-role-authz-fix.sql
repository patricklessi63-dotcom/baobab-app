-- ============================================================================
-- CORRECTIF — platform_role() sans aucune vérification d'autorisation
-- (trouvé lors de l'audit autonome du 2 septembre 2026, passage 148, angle
-- "toutes les fonctions RPC 'security definer' du projet ont-elles une
-- garde d'autorisation" — supabase-admin.sql).
--
-- platform_role(p_profile_id uuid) est "security definer" et renvoie le
-- rôle plateforme (moderator/admin/super_admin ou null) de N'IMPORTE QUEL
-- profil, sans aucune vérification. Or la table platform_roles a une seule
-- policy RLS SELECT, explicite : "Un utilisateur voit son propre role
-- plateforme" (profile_id = current_profile_id()) — c'est-à-dire que
-- l'intention du projet est clairement qu'on ne doit voir QUE son propre
-- rôle. platform_role() étant "security definer", elle contourne cette RLS
-- et, faute de garde interne, exposait donc directement via
-- supabase.rpc('platform_role', { p_profile_id: '<uuid-de-quelquun-dautre>' })
-- le statut modérateur/admin/super_admin de n'importe quel autre
-- utilisateur connecté — une information d'identité du staff qui ne
-- devrait être visible que par le staff lui-même, exactement le même
-- schéma que la faille déjà corrigée sur user_risk_level()
-- (supabase-user-risk-level-authz-fix.sql, passage 147).
--
-- Différence importante avec nearby_profiles()/is_premium() (jugées saines
-- à l'audit) : ces deux-là exposent une information déjà rendue publique
-- ailleurs par construction (nearby_profiles filtre par relation de
-- proximité consentie ; is_premium() ne fait que refléter la colonne
-- profiles.is_premium, déjà publique pour le badge Premium). Le rôle
-- plateforme n'a, lui, JAMAIS d'équivalent public : aucune colonne sur
-- "profiles", aucun badge affiché — la RLS de platform_roles le confirme
-- explicitement en restreignant la lecture à sa propre ligne.
--
-- Vérifié : aucun appel existant de platform_role() avec un p_profile_id
-- différent de current_profile_id() n'a besoin d'un accès "libre" — dans
-- supabase-admin.sql, tous les appels avec un profil tiers
-- (revoke_platform_role, suspend_user, ban_user, admin_search_users) ont
-- lieu soit après confirmation que l'appelant est déjà modérateur+, soit
-- suivis d'une vérification du rang de l'acteur qui rejette de toute façon
-- un appelant non autorisé — le correctif ci-dessous (qui n'autorise la
-- lecture du rôle d'un tiers qu'aux membres du staff) ne change donc le
-- comportement d'AUCUN de ces appels internes.
--
-- Correctif : la lecture reste ouverte sur soi-même (indispensable —
-- is_moderator_or_above()/is_admin_or_above()/is_super_admin() en dépendent
-- pour calculer le rôle de l'appelant), et s'ouvre aussi aux membres du
-- staff pour consulter le rôle d'un tiers (nécessaire à
-- admin_search_users()/grant_platform_role()/revoke_platform_role()/
-- suspend_user()/ban_user()) ; un utilisateur normal ne peut plus
-- apprendre le rôle plateforme de quelqu'un d'autre. Vérification directe
-- sur platform_roles (pas d'appel à is_moderator_or_above(), pour éviter
-- toute récursion puisque cette dernière appelle déjà platform_role()).
-- Idempotent (create or replace) — à exécuter une fois dans Supabase SQL
-- Editor, après supabase-admin.sql.
-- ============================================================================

create or replace function platform_role(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from platform_roles
  where profile_id = p_profile_id
    and (
      -- Toujours autorisé à lire son propre rôle (utilisé par
      -- is_moderator_or_above/is_admin_or_above/is_super_admin).
      p_profile_id = current_profile_id()
      -- Sinon, réservé au staff (moderator/admin/super_admin) — requête
      -- directe sur platform_roles, jamais via is_moderator_or_above(),
      -- pour ne pas créer de dépendance circulaire.
      or exists (
        select 1 from platform_roles pr
        where pr.profile_id = current_profile_id()
          and pr.role in ('moderator','admin','super_admin')
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- set role authenticated; -- ou se connecter avec un compte non-staff
-- select platform_role('<uuid-dun-profil-de-test-different-du-tien>');
-- -- doit renvoyer NULL (aucune ligne) pour un appelant non-staff, et doit
-- -- continuer à renvoyer le rôle correct pour select platform_role(<son-propre-id>)
-- -- ainsi que pour un appelant modérateur+ interrogeant un tiers.
-- ============================================================================
