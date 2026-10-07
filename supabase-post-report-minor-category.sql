-- ============================================================================
-- Signalements de publications / commentaires du fil : autoriser la catégorie
-- « mineur_suspecte » (Apple 1.2 / Google Play UGC — un contenu qui laisse
-- penser qu'un·e mineur·e est présent·e sur une app de rencontre doit pouvoir
-- être signalé en priorité).
--
-- CONTEXTE : la contrainte CHECK de post_reports.category
-- (supabase-feed-posts.sql) n'autorise que 'harcelement','spam','faux_profil',
-- 'contenu_inapproprie','arnaque','autre'. « mineur_suspecte » n'a été ajoutée
-- qu'à la table `reports` (profils) par supabase-report-minor-category.sql.
-- Résultat : le client NE PROPOSE PLUS « Mineur suspecté » pour une publication
-- (src/lib/reportCategories.js : POST_REPORT_CATEGORIES) — l'INSERT aurait échoué
-- avec une erreur générique. Ce script élargit la contrainte ; ensuite, une
-- seule ligne à changer côté client : retirer le .filter(...) de
-- POST_REPORT_CATEGORIES et le test qui l'exige (reportCategories.test.js).
--
-- À exécuter dans Supabase : SQL Editor. Additif (une contrainte remplacée par
-- une version plus permissive : aucune ligne existante ne peut devenir invalide).
-- NE PAS exécuter avant d'avoir livré la version du client qui propose le motif
-- (sans effet négatif si exécuté avant : le client ne l'utilise simplement pas).
-- ============================================================================

alter table post_reports drop constraint if exists post_reports_category_check;
alter table post_reports add constraint post_reports_category_check
  check (category in ('harcelement','spam','faux_profil','contenu_inapproprie','arnaque','mineur_suspecte','autre'));

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'post_reports_category_check';
-- ============================================================================
