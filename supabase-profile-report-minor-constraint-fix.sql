-- ============================================================================
-- CORRECTIF : le motif « Mineur suspecté » est refusé par la base pour les signalements de PROFIL.
-- LIVRÉ, NON EXÉCUTÉ EN PRODUCTION.
--
-- Constat (export du catalogue de production, schema-prod.sql) : la contrainte reports_category_check de la table `reports`
-- (signalements de profil) n'accepte que harcelement, spam, faux_profil, contenu_inapproprie, arnaque, autre. Or le client
-- (src/lib/reportCategories.js, PROFILE_REPORT_CATEGORIES) propose « Mineur suspecté » (mineur_suspecte) : choisir ce motif échoue
-- avec « new row for relation "reports" violates check constraint "reports_category_check" ». La politique de confidentialité
-- promet de traiter ces signalements EN PRIORITÉ : aujourd'hui l'utilisateur ne peut pas les envoyer.
--
-- Cause probable : supabase-report-minor-category.sql (25 août) n'a pas été exécuté, ou une exécution ultérieure du script consolidé
-- a recréé l'ancienne contrainte. NE PAS rejouer supabase-report-minor-category.sql : il redéfinit aussi admin_list_reports() et
-- écraserait le correctif de signalements exécuté le 5 novembre (hotfix bigint/uuid).
--
-- Ce fichier : UNIQUEMENT la contrainte, plus permissive (aucune ligne existante ne peut devenir invalide). Rejouable.
-- Vérification (lecture seule, avant et après) :
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'reports_category_check';
--   -- après : doit contenir mineur_suspecte
-- Retour arrière : remettre l'ancienne liste (sans mineur_suspecte) APRÈS avoir recatégorisé les lignes mineur_suspecte.
-- ============================================================================

alter table reports drop constraint if exists reports_category_check;
alter table reports add constraint reports_category_check check (
  category is null or category in ('harcelement','spam','faux_profil','contenu_inapproprie','arnaque','mineur_suspecte','autre')
);
