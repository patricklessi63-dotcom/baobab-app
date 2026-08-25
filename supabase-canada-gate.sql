-- ============================================================================
-- Baobab 3.0, Partie A — restriction géographique du module Rencontres au
-- Canada (prompt-geolocalisation-et-ouverture-baobab.md). Additif à
-- supabase-geolocation.sql (déjà exécuté). À exécuter une fois dans
-- Supabase SQL Editor.
--
-- Contexte : la localisation était déjà une condition d'accès obligatoire à
-- toute l'app (bêta privée), mais rien ne vérifiait que la position se
-- trouvait au Canada. Ce fichier ajoute une seule colonne de suivi ;
-- l'appartenance au Canada elle-même est calculée côté client (boîte
-- englobante latitude/longitude, voir src/lib/canadaGate.js) — aucun calcul
-- serveur, aucune donnée supplémentaire envoyée.
-- ============================================================================

alter table user_locations add column if not exists last_in_canada_at timestamptz;

-- Backfill IMPORTANT : sans ça, tout compte déjà établi dont la dernière
-- position connue tombe hors de la boîte englobante (imprécision près d'une
-- frontière, ancienne position jamais mise à jour, etc.) se retrouverait
-- immédiatement bloqué du module Rencontres au premier chargement après
-- cette migration, sans aucune période de grâce — contraire à la règle du
-- prompt ("ne jamais couper l'usage d'un compte déjà établi à cause d'un
-- déplacement ponctuel"). On démarre donc la période de grâce de 60 jours
-- à partir de maintenant pour tout le monde, uniforme et sans jugement sur
-- la position actuelle de qui que ce soit.
update user_locations set last_in_canada_at = now() where last_in_canada_at is null;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif) :
-- select count(*) from user_locations where last_in_canada_at is null;
-- ============================================================================
