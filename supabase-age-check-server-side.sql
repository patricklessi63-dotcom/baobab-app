-- ============================================================================
-- Audit sécurité (prompt-securite-verification-moderation-baobab.md) —
-- constat classé Bloquant, remonté immédiatement comme le prompt l'exige :
-- l'âge minimum de 18 ans (déjà appliqué au module Rencontres via
-- prompt-rencontres-matching-baobab.md) n'était vérifié QUE côté client
-- (Step1Identity.jsx, onboarding), jamais côté base de données. Une requête
-- directe à l'API REST Supabase (hors de l'interface React) pouvait donc
-- créer ou modifier un profil avec une date de naissance impliquant un âge
-- inférieur à 18 ans, sans aucun blocage serveur. Ce fichier ajoute le
-- filet de sécurité manquant. À exécuter dans Supabase : SQL Editor.
-- ============================================================================

-- NOT VALID : n'exige pas que les lignes déjà existantes soient revalidées
-- immédiatement (évite un verrou long sur toute la table profiles et une
-- éventuelle erreur bloquante si une ligne existante ne respecte pas la
-- règle) — s'applique dès maintenant à tout nouvel INSERT/UPDATE. birth_date
-- reste autorisé à être vide (onboarding pas encore complété).
alter table profiles add constraint profiles_min_age_18
  check (birth_date is null or birth_date <= (current_date - interval '18 years'))
  not valid;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
--
-- 1. Repérer d'éventuels comptes existants qui ne respecteraient pas la
--    règle (à traiter au cas par cas si le résultat n'est pas vide — ne
--    jamais supprimer un compte automatiquement sur cette seule base) :
-- select id, name, birth_date from profiles
--   where birth_date is not null and birth_date > (current_date - interval '18 years');
--
-- 2. Une fois confirmé qu'aucune ligne existante ne pose problème (ou après
--    les avoir traitées), valider pleinement la contrainte pour qu'elle
--    couvre aussi les lignes déjà en base :
-- alter table profiles validate constraint profiles_min_age_18;
-- ============================================================================
