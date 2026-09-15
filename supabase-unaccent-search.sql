-- ============================================================================
-- Recherche insensible aux accents (unaccent) — à exécuter dans Supabase :
-- SQL Editor > New query. Additif, sans risque : crée une extension, une
-- fonction et des index — n'altère ni ne supprime aucune donnée ni aucun
-- objet existant. Idempotent (IF NOT EXISTS / CREATE OR REPLACE partout) :
-- peut être rejoué sans erreur si une partie a déjà été exécutée.
-- ============================================================================
-- CONTEXTE (bug trouvé à l'audit) : la recherche texte serveur (PostgREST)
-- de CommunitiesTab.jsx, EventsTab.jsx et CommunityInviteModal.jsx utilise
-- `ILIKE`, qui est insensible à la casse mais PAS aux accents. Chercher
-- "Montreal" ne trouve donc pas "Montréal", "cafe" ne trouve pas "café",
-- etc. Un audit précédent avait corrigé l'échappement des caractères
-- spéciaux ILIKE (%/_) dans ces mêmes requêtes (voir searchQuery.js) mais
-- n'avait pas touché ce problème-ci car il nécessite l'extension Postgres
-- `unaccent`, indisponible côté client (JS) — d'où ce fichier SQL séparé.
--
-- Colonnes concernées (identifiées en lisant les trois fichiers ci-dessus) :
--   - communities.name         (CommunitiesTab.jsx, recherche principale)
--   - communities.description  (CommunitiesTab.jsx, recherche principale)
--   - communities.city         (CommunitiesTab.jsx, filtre "Ville")
--   - events.title             (EventsTab.jsx, recherche principale)
--   - events.description       (EventsTab.jsx, recherche principale)
--   - events.city              (EventsTab.jsx, filtre "Ville")
--   - profiles.name            (CommunityInviteModal.jsx, recherche de
--                                profils à inviter dans une communauté)
--
-- CE FICHIER NE FAIT QUE PRÉPARER LE TERRAIN CÔTÉ BASE (extension, fonction
-- immutable, index). AUCUN code JS n'est modifié ici — les trois fichiers
-- ci-dessus continuent d'utiliser `ILIKE` tel quel après exécution de ce
-- script, donc le bug d'accents N'EST PAS ENCORE corrigé pour l'utilisateur
-- une fois ce script joué seul.
--
-- PROCHAINE ÉTAPE (hors périmètre ici, à faire dans une session future
-- capable de vérifier contre la vraie base) : remplacer, dans les 3
-- requêtes de recherche listées ci-dessus, le filtre `ILIKE` sur la colonne
-- brute par une comparaison sur `unaccent_immutable(lower(colonne))`
-- (fonction définie plus bas). PostgREST ne sait pas filtrer directement sur
-- une expression SQL arbitraire depuis le client JS (`.ilike()`/`.or()` ne
-- prennent que des noms de colonnes) — il faudra donc probablement soit :
--   (a) une colonne générée persistée (`generated always as (...) stored`)
--       sur chaque colonne de recherche, indexée et filtrable directement
--       par le client (le terme tapé devra alors aussi être normalisé côté
--       client avant l'appel, ou via une fonction JS équivalente à unaccent) ;
--   (b) ou une RPC dédiée qui fait la recherche côté serveur et renvoie les
--       lignes déjà filtrées, appelée via `.rpc(...)` à la place de
--       `.select().ilike()`.
-- Ce choix nécessite de tester la requête PostgREST exacte contre Supabase
-- (ce que cette session ne peut pas faire) — non tranché ici volontairement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions — schéma "extensions" (convention Supabase : les extensions
-- ajoutées après la création du projet sont installées là par défaut via le
-- dashboard, plutôt que dans "public"). IF NOT EXISTS : no-op si déjà
-- installées ailleurs (peu importe le schéma existant, la clause échoue
-- silencieusement sans dupliquer).
-- ----------------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ----------------------------------------------------------------------------
-- 2. Fonction wrapper IMMUTABLE — Postgres exige une fonction explicitement
-- marquée IMMUTABLE pour l'utiliser dans une expression d'index ; la
-- fonction native unaccent(text) n'est marquée que STABLE (elle dépend en
-- théorie du dictionnaire de recherche configuré), ce qui empêche Postgres
-- de l'accepter directement dans un index. Pattern standard documenté par le
-- wiki PostgreSQL : passer explicitement le nom du dictionnaire
-- ('extensions.unaccent', qualifié par le schéma choisi ci-dessus) à la
-- surcharge unaccent(regdictionary, text), ce qui permet d'affirmer en toute
-- sécurité l'immutabilité (le dictionnaire "unaccent" ne change pas en
-- pratique). Placée dans "public" (comme le reste des fonctions applicatives
-- du projet, ex. accept_join_request dans supabase-communities.sql) plutôt
-- que dans "extensions", qui ne contient que les objets des extensions
-- elles-mêmes.
-- ----------------------------------------------------------------------------
create or replace function public.unaccent_immutable(text)
returns text
language sql
immutable
strict
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

comment on function public.unaccent_immutable(text) is
  'Wrapper IMMUTABLE autour de extensions.unaccent() (STABLE par defaut), '
  'necessaire pour indexer une expression unaccent(...) — voir supabase-unaccent-search.sql.';

-- ----------------------------------------------------------------------------
-- 3. Index trigram (pg_trgm) sur unaccent_immutable(lower(colonne)) pour
-- chaque colonne cherchée par ILIKE — sans ces index, une recherche future
-- réécrite pour utiliser unaccent_immutable(...) dégénérerait en scan complet
-- de la table (aucun index n'existe aujourd'hui sur une expression
-- unaccent/lower). "gin_trgm_ops" permet d'accélérer un ILIKE '%terme%'
-- (motif non ancré), ce qu'un index b-tree classique ne peut pas faire.
-- ----------------------------------------------------------------------------

-- communities.name / description / city
create index if not exists idx_communities_name_unaccent_trgm
  on communities using gin (unaccent_immutable(lower(name)) gin_trgm_ops);
create index if not exists idx_communities_description_unaccent_trgm
  on communities using gin (unaccent_immutable(lower(description)) gin_trgm_ops);
create index if not exists idx_communities_city_unaccent_trgm
  on communities using gin (unaccent_immutable(lower(city)) gin_trgm_ops);

-- events.title / description / city
create index if not exists idx_events_title_unaccent_trgm
  on events using gin (unaccent_immutable(lower(title)) gin_trgm_ops);
create index if not exists idx_events_description_unaccent_trgm
  on events using gin (unaccent_immutable(lower(description)) gin_trgm_ops);
create index if not exists idx_events_city_unaccent_trgm
  on events using gin (unaccent_immutable(lower(city)) gin_trgm_ops);

-- profiles.name (recherche de profils à inviter — CommunityInviteModal.jsx)
create index if not exists idx_profiles_name_unaccent_trgm
  on profiles using gin (unaccent_immutable(lower(name)) gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- Vérification manuelle après exécution (à coller séparément dans le SQL
-- Editor si besoin) :
--
--   select unaccent_immutable(lower('Montréal'));  -- doit renvoyer 'montreal'
--
--   select indexname from pg_indexes
--   where indexname like '%_unaccent_trgm' order by indexname;
--   -- doit lister les 7 index créés ci-dessus.
-- ----------------------------------------------------------------------------
