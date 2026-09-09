-- ============================================================================
-- Audit de confiance (cette passe) : un correctif précédent
-- (supabase-profile-text-length-guard-fix.sql) affirmait dans son propre
-- commentaire que "bio" était "déjà protégée côté serveur", ce qui était
-- faux — jamais vérifié empiriquement, seulement supposé
-- (supabase-profile-bio-length-guard-fix.sql a corrigé "bio" seule). Cette
-- passe relit donc RÉELLEMENT le SQL de base de chaque colonne prétendument
-- protégée, puis étend la vérification à toutes les colonnes texte libre de
-- contenu généré par l'utilisateur trouvées dans le dépôt.
--
-- Résultat de l'audit des correctifs déjà écrits (aucune correction requise
-- ici, seulement une vérification) :
--   - supabase-profile-text-length-guard-fix.sql (name/last_name/country/
--     province/city/occupation/arrival_city) : contraintes CHECK réellement
--     présentes dans ce même fichier, aucune autre définition de "profiles"
--     ne les contredit. Confirmé correct.
--   - supabase-profile-bio-length-guard-fix.sql (bio) : idem, confirmé correct.
--   - community_posts.body / post_comments.body / posts.body (fil général)
--     (supabase-communities.sql, supabase-feed-posts.sql) : la contrainte
--     "check (char_length(body) between 1 and 4000)" / "...1000)" est posée
--     directement à la création de la table — confirmé correct par lecture
--     directe, pas par confiance au commentaire.
--   - event_comments.body (supabase-events-v2.sql) : même motif, confirmé
--     correct (between 1 and 1000).
--   - messages.text (supabase-scale-security-2.sql) : "check (text is null
--     or char_length(text) <= 4000)" réellement présent. Confirmé correct —
--     couvre aussi la réponse à un statut (sendStoryReply -> messages).
--   - immigration-news/info/beta-feedback (title/summary/body/message) :
--     contraintes "between X and Y" réellement présentes à la création des
--     tables (supabase-info.sql, supabase-beta-tracking.sql,
--     supabase-beta-feedback-category.sql). Confirmé correct.
--
-- Colonnes texte libre trouvées SANS AUCUNE contrainte serveur réelle (vérifié
-- par lecture directe de supabase-communities.sql, supabase-events.sql,
-- supabase-events-v2.sql, supabase-stories.sql, supabase-messaging.sql,
-- supabase-info.sql — pas seulement grep des commentaires) — voir le tableau
-- complet dans le résumé de session. Toutes ont déjà une limite CÔTÉ CLIENT
-- (sauf communities.city / events.city / events.location, qui n'en ont
-- aucune, ni client ni serveur) ; ce script ajoute la garde serveur
-- manquante, au même modèle que les correctifs précédents : idempotent
-- (if not exists sur pg_constraint), NOT VALID (ne valide jamais
-- rétroactivement les lignes déjà en base — seules les prochaines écritures
-- sont contrôlées). À exécuter dans Supabase : SQL Editor (une fois,
-- indépendant des autres scripts de cette liste).
-- ============================================================================

-- ---------- communities (name/description/rules/city) ----------
-- Limites alignées sur le client (CommunityCreateForm.jsx : NAME_MAX=80,
-- DESCRIPTION_MAX=300, RULES_MAX=1000) ; "city" n'a de limite nulle part
-- (ni client ni serveur) — alignée sur profiles_city_length (80).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_name_length') then
    alter table communities add constraint communities_name_length
      check (char_length(name) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_description_length') then
    alter table communities add constraint communities_description_length
      check (description is null or char_length(description) <= 300) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_rules_length') then
    alter table communities add constraint communities_rules_length
      check (rules is null or char_length(rules) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_city_length') then
    alter table communities add constraint communities_city_length
      check (city is null or char_length(city) <= 80) not valid;
  end if;
end $$;

-- ---------- events (title/description/city/location) ----------
-- Limites alignées sur le client (EventCreateForm.jsx/EventEditForm.jsx :
-- TITLE_MAX=80, DESCRIPTION_MAX=500) ; "city" (alignée sur
-- profiles_city_length, 80) et "location" (lieu public optionnel, ex.
-- "Café Aunja, Plateau-Mont-Royal" — 150) n'ont de limite nulle part.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_title_length') then
    alter table events add constraint events_title_length
      check (char_length(title) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_description_length') then
    alter table events add constraint events_description_length
      check (description is null or char_length(description) <= 500) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_city_length') then
    alter table events add constraint events_city_length
      check (city is null or char_length(city) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_location_length') then
    alter table events add constraint events_location_length
      check (location is null or char_length(location) <= 150) not valid;
  end if;
end $$;

-- ---------- stories.text (statuts) ----------
-- Limite alignée sur le client (StoryComposerModal.jsx : maxLength={280}).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stories_text_length') then
    alter table stories add constraint stories_text_length
      check (text is null or char_length(text) <= 280) not valid;
  end if;
end $$;

-- ---------- reason des signalements (profil/communauté/post/événement/info)
-- ----------
-- Les cinq tables de signalement partagent la même modale côté client
-- (ReportModal.jsx), qui tronque déjà "reason" à 1000 caractères
-- (truncateUnicodeSafe(e.target.value, 1000)) — mais aucune des cinq tables
-- n'avait de contrainte serveur correspondante : un appel direct à l'API
-- pouvait toujours écrire un texte de taille arbitraire. "info_reports" et
-- "recommendation_feedback" ne sont pour l'instant appelées par aucun
-- composant de l'interface (fonctionnalité non branchée / feedback jamais
-- envoyé avec un motif) mais restent atteignables via l'API avec un JWT
-- valide — protégées par cohérence avec le reste de la famille.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_reason_length') then
    alter table reports add constraint reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_reports_reason_length') then
    alter table community_reports add constraint community_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'post_reports_reason_length') then
    alter table post_reports add constraint post_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_reports_reason_length') then
    alter table event_reports add constraint event_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'info_reports_reason_length') then
    alter table info_reports add constraint info_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recommendation_feedback_reason_length') then
    alter table recommendation_feedback add constraint recommendation_feedback_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Colonnes texte volontairement NON incluses ci-dessus, vérifiées puis
-- écartées (pas une omission) :
--   - profiles.interests / usage_goals / pref_looking_for / relationship_values
--     / relationship_needs / wants_children / family_importance / career_goal
--     / geographic_openness / personality_evening / personality_travel /
--     immigration_status / education_level : toutes alimentées exclusivement
--     par des ChipSelect à vocabulaire FIXE côté client (constants.js), pas
--     du texte réellement libre — vérifié en lisant chaque Step*.jsx /
--     EditProfileForm.jsx, pas supposé.
--   - blocks : pas de colonne "reason" du tout (vérifié dans
--     supabase-matching.sql) — rien à protéger.
--   - suspend_reason / ban_reason (supabase-admin.sql) : saisis par un
--     modérateur/admin de confiance, jamais par un utilisateur final — hors
--     périmètre "contenu généré par l'utilisateur" de cet audit.
--   - user_locations.city/region/country (supabase-geolocation.sql) :
--     renseignées par le service de géolocalisation IP côté serveur, jamais
--     tapées par l'utilisateur.
--
-- Optionnel, une fois toutes les lignes existantes vérifiées propres :
-- valider réellement les contraintes ci-dessus (les rend opposables aux
-- lignes déjà en base, pas seulement aux futures écritures) :
--   alter table communities validate constraint communities_name_length;
--   alter table communities validate constraint communities_description_length;
--   alter table communities validate constraint communities_rules_length;
--   alter table communities validate constraint communities_city_length;
--   alter table events validate constraint events_title_length;
--   alter table events validate constraint events_description_length;
--   alter table events validate constraint events_city_length;
--   alter table events validate constraint events_location_length;
--   alter table stories validate constraint stories_text_length;
--   alter table reports validate constraint reports_reason_length;
--   alter table community_reports validate constraint community_reports_reason_length;
--   alter table post_reports validate constraint post_reports_reason_length;
--   alter table event_reports validate constraint event_reports_reason_length;
--   alter table info_reports validate constraint info_reports_reason_length;
--   alter table recommendation_feedback validate constraint recommendation_feedback_reason_length;
