-- ============================================================================
-- Ajout du champ "Nom" (nom de famille, distinct du prénom déjà existant)
-- à l'onboarding et à l'édition de profil. Additif, aucun impact sur les
-- comptes existants (colonne nullable, "name" reste inchangé = prénom).
-- ============================================================================

alter table profiles add column if not exists last_name text;
