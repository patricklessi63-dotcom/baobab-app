-- ============================================================================
-- Filet de sécurité pour l'erreur console non expliquée :
--   GET /rest/v1/user_locations?select=* → 400
--
-- Contexte de l'investigation (passage 83, audit continu) :
-- - current_profile_id() existe bel et bien (défini dans supabase-communities.sql)
--   mais n'est PAS utilisé par user_locations : ses policies comparent
--   directement auth.uid() = user_id (voir supabase-geolocation.sql). Piste
--   écartée.
-- - Aucun autre fichier .sql du dépôt ne redéfinit la table ou les policies
--   de user_locations de façon incompatible. Piste écartée.
-- - Testé avec la version installée de @supabase/postgrest-js (2.112.3) :
--   .maybeSingle() n'envoie plus l'en-tête Accept:
--   application/vnd.pgrst.object+json (comportement des anciennes versions)
--   — la requête part comme un GET tout ce qu'il y a de plus normal, sans
--   filtre, et le tri "0 ou 1 ligne" se fait côté client. Piste écartée.
-- - Un seul appel dans tout le code (src/lib/locationApi.js:fetchMyLocation)
--   fait ce SELECT ; aucune autre syntaxe concurrente trouvée. Piste écartée.
-- - numeric(6,2) est cohérent avec les plages lat/lng réellement utilisées,
--   et de toute façon une contrainte numeric ne peut jamais faire échouer un
--   SELECT (seulement une écriture) — piste écartée par construction.
-- - Testé en direct (curl, requête anonyme, sans session) :
--   GET .../user_locations?select=* → 200 [] : confirme que la table, ses
--   colonnes et les droits de base sont sains pour le rôle "anon".
-- - Reproduit qu'une erreur Postgres de classe 42 (colonne/fonction
--   inexistante) est bien ce qui produit un vrai 400 chez PostgREST (testé
--   avec une colonne volontairement inventée : {"code":"42703", ...} → 400).
--   Un JWT invalide/expiré donne systématiquement 401 (PGRST301), jamais 400
--   — donc la piste "session pas encore prête" est écartée.
--
-- Hypothèse retenue, non vérifiable sans accès direct à la base de
-- production (aucune clé service_role disponible ici, et la création d'un
-- compte de test pour forger un JWT authentifié est une action interdite
-- pour cet agent) : une policy RLS ou un droit (GRANT) ajouté un jour
-- directement depuis le tableau de bord Supabase — donc invisible dans ce
-- dépôt — s'applique spécifiquement au rôle "authenticated" et référence une
-- colonne qui n'existe plus (ou n'a jamais existé), ce qui expliquerait
-- pourquoi seule une requête *authentifiée* échoue alors que la requête
-- anonyme équivalente réussit.
--
-- Ce script est idempotent et sans risque : il supprime TOUTES les policies
-- actuellement posées sur public.user_locations (quel que soit leur nom,
-- y compris une éventuelle policy fantôme créée hors dépôt) puis recrée
-- exactement les 4 policies canoniques de supabase-geolocation.sql, et
-- pose des GRANT explicites pour éliminer toute dérive de droits.
-- À exécuter une fois dans Supabase : SQL Editor.
-- ============================================================================

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_locations'
  loop
    execute format('drop policy if exists %I on public.user_locations', pol.policyname);
  end loop;
end $$;

create policy "user_locations_select_own" on public.user_locations
  for select using (auth.uid() = user_id);

create policy "user_locations_insert_own" on public.user_locations
  for insert with check (auth.uid() = user_id);

create policy "user_locations_update_own" on public.user_locations
  for update using (auth.uid() = user_id);

create policy "user_locations_delete_own" on public.user_locations
  for delete using (auth.uid() = user_id);

-- Droits explicites (au cas où le GRANT initial aurait été partiel ou
-- posé au niveau colonne depuis le tableau de bord) — RLS reste la seule
-- barrière réelle, ces GRANT ne donnent accès à aucune ligne d'un autre
-- utilisateur.
grant select, insert, update, delete on public.user_locations to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, roles, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'user_locations';
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'user_locations';
-- ============================================================================
