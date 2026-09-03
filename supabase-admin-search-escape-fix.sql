-- ============================================================================
-- CORRECTIF — admin_search_users() : jokers ILIKE ("%"/"_") non échappés
-- dans la recherche admin (trouvé lors de l'audit autonome du 2 septembre
-- 2026, dernier passage, angle "autres endroits qui font une recherche
-- ILIKE/.or() sans passer par escapeLikePattern/escapeOrFilterValue" — même
-- classe de bug que celui corrigé côté client dans CommunitiesTab.jsx /
-- EventsTab.jsx / SocialShell.jsx, mais ici côté serveur).
--
-- admin_search_users(p_query) (supabase-admin.sql, ~ligne 320) construit le
-- pattern ILIKE ainsi :
--   p.name ilike '%' || p_query || '%'
-- p_query est un paramètre lié (via supabase.rpc), donc AUCUNE injection SQL
-- n'est possible ici — mais "%" et "_" restent des jokers du moteur
-- ILIKE/LIKE de Postgres même une fois la valeur liée : si un·e
-- modérateur·rice/admin cherche un nom contenant littéralement "_" (assez
-- courant dans un pseudo/handle, ex. "jean_dupont") ou "%", ces caractères
-- sont interprétés comme "n'importe quel caractère" / "n'importe quelle
-- suite de caractères" au lieu du texte exact saisi — la recherche renvoie
-- alors des profils qui ne correspondent pas à la saisie littérale
-- (résultats trop larges, silencieusement).
--
-- Correctif : échapper "\", "%" et "_" dans p_query avant de construire le
-- pattern (même ordre que escapeLikePattern côté JS dans
-- src/lib/searchQuery.js — backslash en premier car c'est le caractère
-- d'échappement lui-même). Aucun ajout de clause "escape" nécessaire :
-- backslash est déjà le caractère d'échappement par défaut de LIKE/ILIKE en
-- Postgres. Pas de risque d'erreur 400 façon PGRST100 ici (pas de
-- .or()/virgule impliqué, une seule condition ILIKE simple) — seul
-- escapeLikePattern a un équivalent utile côté SQL, pas escapeOrFilterValue.
-- Idempotent (create or replace) — à exécuter une fois dans Supabase SQL
-- Editor, après supabase-admin.sql.
-- ============================================================================

create or replace function admin_search_users(p_query text default '')
returns table (
  id uuid, name text, avatar_url text, created_at timestamptz,
  role text, suspended_until timestamptz, banned_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select p.id, p.name, p.avatar_url, p.created_at,
      platform_role(p.id), p.suspended_until, p.banned_at
    from profiles p
    where p_query = '' or p.name ilike '%' ||
      replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by p.created_at desc
    limit 100;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- -- créer/renommer temporairement un profil de test en "test_user" puis :
-- select name from admin_search_users('test_user');
-- -- doit renvoyer uniquement "test_user" (pas tout profil dont le nom
-- -- contiendrait "test" + un caractère + "user"), en étant connecté avec un
-- -- compte modérateur+.
-- ============================================================================
