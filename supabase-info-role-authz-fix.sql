-- ============================================================================
-- CORRECTIF — info_role() sans aucune vérification d'autorisation (trouvé
-- lors de l'audit autonome du 2 septembre 2026, passage 148, même angle que
-- supabase-platform-role-authz-fix.sql — supabase-info.sql).
--
-- info_role(p_profile_id uuid) est "security definer" et renvoie le rôle
-- éditorial Baobab Info (editor/admin ou null) de N'IMPORTE QUEL profil,
-- sans aucune vérification. La table info_editors a une seule policy RLS
-- SELECT, explicite : "Un utilisateur voit son propre statut editeur"
-- (profile_id = current_profile_id()) — même intention que platform_roles.
-- info_role() étant "security definer", elle contourne cette RLS et, faute
-- de garde interne, exposait directement via
-- supabase.rpc('info_role', { p_profile_id: '<uuid-de-quelquun-dautre>' })
-- le statut éditeur/admin de n'importe quel autre utilisateur connecté.
--
-- Vérifié (grep sur tous les supabase-*.sql) : info_role() n'est appelée
-- nulle part ailleurs dans le projet qu'avec current_profile_id() — aucun
-- appel avec le profil d'un tiers, contrairement à platform_role(). Le
-- correctif ci-dessous peut donc être encore plus strict : lecture limitée
-- à son propre statut, sans aucune ouverture au staff (si un futur écran
-- d'administration des éditeurs Baobab Info a besoin de lister les rôles
-- d'autrui, il devra passer par une RPC dédiée gardée par
-- is_info_admin(), comme admin_search_users() le fait déjà pour les rôles
-- plateforme — jamais en assouplissant cette fonction de base).
--
-- Correctif : idempotent (create or replace) — à exécuter une fois dans
-- Supabase SQL Editor, après supabase-info.sql.
-- ============================================================================

create or replace function info_role(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from info_editors
  where profile_id = p_profile_id
    and p_profile_id = current_profile_id();
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- set role authenticated; -- ou se connecter avec un compte quelconque
-- select info_role('<uuid-dun-profil-de-test-different-du-tien>');
-- -- doit renvoyer NULL (aucune ligne), y compris pour un compte admin
-- -- Baobab Info interrogeant un tiers.
-- select info_role('<ton-propre-id>'); -- doit continuer à fonctionner normalement.
-- ============================================================================
