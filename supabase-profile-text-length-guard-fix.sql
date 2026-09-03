-- ============================================================================
-- Corrige un bug d'audit (profil/matching, passage de nettoyage
-- focus-visible + exploration matching/EditProfileForm) : plusieurs champs
-- texte libre de "profiles" (name, last_name, country, province, city,
-- occupation, arrival_city) n'avaient AUCUNE limite de longueur, ni côté
-- client (EditProfileForm.jsx, Step1Identity.jsx, Step3Location.jsx,
-- Step4CanadaJourney.jsx — contrairement à "bio", limitée à 300 caractères
-- des deux côtés) ni côté serveur (colonnes "text" sans contrainte, voir
-- supabase-schema.sql). Un utilisateur pouvait donc coller un texte
-- arbitrairement long (des dizaines de milliers de caractères) dans
-- "Prénom" ou "Ville" : ce texte est ensuite affiché tel quel sur de
-- nombreuses cartes/badges dans toute l'app (Discover, MatchCard,
-- PublicProfileModal, filtres...), et sert aussi de donnée d'entrée au
-- calcul de compatibilité (matchingService.js) — au mieux une mise en page
-- cassée, au pire une base gonflée inutilement.
--
-- Le correctif client (maxLength sur chaque <input>) est déjà en place ;
-- ce script ajoute la garde serveur symétrique manquante, sur le même
-- modèle que events_duration_minutes_positive
-- (supabase-events-duration-guard.sql) — idempotent, sans jamais valider
-- rétroactivement les lignes déjà en base (NOT VALID : les profils
-- existants, même hors bornes, ne sont jamais bloqués en lecture ni cassés
-- par ce script ; seules les prochaines écritures sont contrôlées).
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_length') then
    alter table profiles add constraint profiles_name_length
      check (char_length(name) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_last_name_length') then
    alter table profiles add constraint profiles_last_name_length
      check (last_name is null or char_length(last_name) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_country_length') then
    alter table profiles add constraint profiles_country_length
      check (country is null or char_length(country) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_province_length') then
    alter table profiles add constraint profiles_province_length
      check (province is null or char_length(province) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_city_length') then
    alter table profiles add constraint profiles_city_length
      check (city is null or char_length(city) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_occupation_length') then
    alter table profiles add constraint profiles_occupation_length
      check (occupation is null or char_length(occupation) <= 120) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_arrival_city_length') then
    alter table profiles add constraint profiles_arrival_city_length
      check (arrival_city is null or char_length(arrival_city) <= 80) not valid;
  end if;
end $$;

-- Optionnel, une fois toutes les lignes existantes vérifiées propres :
-- valider réellement les contraintes ci-dessus (les rend opposables aux
-- lignes déjà en base, pas seulement aux futures écritures) :
--   alter table profiles validate constraint profiles_name_length;
--   alter table profiles validate constraint profiles_last_name_length;
--   alter table profiles validate constraint profiles_country_length;
--   alter table profiles validate constraint profiles_province_length;
--   alter table profiles validate constraint profiles_city_length;
--   alter table profiles validate constraint profiles_occupation_length;
--   alter table profiles validate constraint profiles_arrival_city_length;
