-- Ajoute un filtre explicite "type de relation recherché" aux préférences de
-- correspondance (audit du 22 août 2026 — le champ "looking_for" est déjà
-- capturé à l'onboarding et déjà utilisé dans le score de matching, mais
-- n'était pas exposé comme filtre dur dans MatchPreferencesModal.jsx, qui ne
-- couvrait que l'âge et la distance).
--
-- Colonne texte, valeurs jointes par ", " — même convention que la colonne
-- "looking_for" existante (voir App.jsx / OnboardingWizard.jsx). Nullable et
-- sans valeur par défaut : un preference vide veut dire "aucun filtre", géré
-- côté application dans filterCandidatesByPreferences().
--
-- À exécuter manuellement dans le SQL Editor Supabase du projet
-- vozehymbihnckzklxesw. Additive uniquement, aucune donnée existante touchée.

alter table profiles
  add column if not exists pref_looking_for text;
