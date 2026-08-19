-- ============================================================================
-- Réglage de confidentialité "afficher mon année de naissance" — exclusif au
-- fondateur (is_founder), non proposé aux autres utilisateurs dans
-- PrivacyFieldsModal. À exécuter dans Supabase : SQL Editor. Additif
-- uniquement.
-- ============================================================================

alter table profiles add column if not exists show_birth_year boolean not null default true;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif) :
-- select id, name, is_founder, show_birth_year from profiles where is_founder = true;
-- ============================================================================
