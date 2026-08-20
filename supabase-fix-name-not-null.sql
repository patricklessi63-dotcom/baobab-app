-- ============================================================================
-- Correctif urgent — inscription cassée : profiles.name est NOT NULL sans
-- défaut, mais OnboardingWizard.jsx crée la ligne profil dès l'étape 1
-- (objectif d'usage) volontairement AVANT de demander le nom, repoussé à
-- l'étape 2 (voir commentaire ligne ~94 du fichier). Le INSERT initial
-- n'envoie donc jamais "name", ce qui viole la contrainte à chaque
-- inscription (erreur Postgres 23502).
--
-- Vrai correctif, pas un contournement : le nom est un champ obligatoire
-- DANS L'APP (isStep1Valid bloque la progression tant qu'il est vide,
-- Step1Identity.jsx), donc son absence n'est possible que dans la fenêtre
-- transitoire entre la création du compte et la fin de l'étape 2 — jamais
-- sur un profil complété. La colonne doit refléter ça : nullable en base,
-- obligatoire au niveau applicatif (déjà le cas).
-- ============================================================================

alter table profiles alter column name drop not null;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif) :
-- select column_name, is_nullable from information_schema.columns where table_name='profiles' and column_name='name';
-- ============================================================================
