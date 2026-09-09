-- ============================================================================
-- Corrige un bug d'audit (passe applicatif/UX : cohérence validation client
-- vs serveur du formulaire de profil) : le champ "bio" de "profiles" est
-- limité à 300 caractères CÔTÉ CLIENT à trois endroits (EditProfileForm.jsx,
-- Step9PersonalityBio.jsx à l'onboarding, et la troncature appliquée au
-- résultat d'AiSuggestButton "Améliorer ma bio" dans les deux écrans) — mais
-- ne l'était NULLE PART côté serveur : la colonne "bio" est un simple "text"
-- sans aucune contrainte (voir supabase-schema.sql, ligne "bio text,").
--
-- supabase-profile-text-length-guard-fix.sql avait déjà ajouté la garde
-- serveur symétrique pour name/last_name/country/province/city/occupation/
-- arrival_city, mais son commentaire affirmait par erreur que "bio" était
-- "limitée à 300 caractères des deux côtés" : ce n'est vrai que côté client.
-- Un appel direct à l'API Supabase (contournant l'UI, avec un JWT valide déjà
-- authentifié) peut donc toujours écrire une bio arbitrairement longue,
-- ensuite affichée telle quelle sur PublicProfileModal/ProfileTab/les cartes
-- de match, comme les autres champs déjà corrigés.
--
-- Même modèle que supabase-profile-text-length-guard-fix.sql : idempotent,
-- NOT VALID (ne valide jamais rétroactivement les lignes déjà en base — seules
-- les prochaines écritures sont contrôlées).
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length') then
    alter table profiles add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 300) not valid;
  end if;
end $$;

-- Optionnel, une fois toutes les lignes existantes vérifiées propres :
-- valider réellement la contrainte ci-dessus (la rend opposable aux lignes
-- déjà en base, pas seulement aux futures écritures) :
--   alter table profiles validate constraint profiles_bio_length;
