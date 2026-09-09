-- ============================================================================
-- Correctif : "Qui m'a aimé" / matchs renvoyaient le PROFIL COMPLET (toutes
-- les colonnes de "profiles") au lieu d'un sous-ensemble sûr — même famille
-- de bug que supabase-premium-admirers-reveal-fix.sql (client vs serveur),
-- mais un cran plus loin : ce fichier-là a corrigé QUI peut recevoir le
-- profil d'un·e admirateur·ice (gate Premium/match mutuel), pas QUELLES
-- COLONNES sont renvoyées une fois l'accès autorisé.
--
-- Constat (get_my_likers()/get_liker_profile_reveal(), déjà en prod depuis
-- supabase-premium-admirers-reveal-fix.sql) : `to_jsonb(p.*)` renvoie
-- LITTÉRALEMENT toutes les colonnes de "profiles" à quiconque a un match
-- mutuel (aucune restriction Premium sur les matchs) ou qui est Premium —
-- y compris des colonnes jamais destinées à un autre utilisateur que le
-- titulaire du compte : ban_reason, suspend_reason, flagged_for_review,
-- report_count, deletion_requested_at, birth_date (date de naissance EXACTE,
-- bien plus précise que l'année que show_birth_year prétend masquer),
-- notification_preferences, pref_age_min/pref_age_max/pref_distance/
-- pref_looking_for, onboarding_step, usage_goals. AdmirersModal.jsx/
-- MatchCard.jsx/ConversationPane.jsx/MessagesTab.jsx n'affichent qu'une
-- poignée de ces champs (voir profile_public_json ci-dessous, dont la liste
-- est dérivée de l'usage réel côté client — PublicProfileModal.jsx a déjà le
-- même principe : "allow-list explicite des champs affichés, jamais de
-- spread {...profile}"), mais la donnée en trop a déjà transité en clair
-- dans la réponse réseau du RPC (onglet Réseau du navigateur), qu'elle soit
-- affichée ou non.
--
-- Portée volontairement limitée à ces deux RPC (pas de refonte de loadAll()
-- dans App.jsx, qui charge encore "profiles" en `select("*")` pour la liste
-- de candidats/le cache local — un chantier plus large, à traiter à part vu
-- son ampleur et son rôle central dans l'app). Additif uniquement.
--
-- Prérequis : supabase-premium-admirers-reveal-fix.sql (fonctions à
-- remplacer ci-dessous), supabase-premium.sql (current_profile_id/
-- is_premium). À exécuter dans Supabase : SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Allow-list partagée — un seul endroit à maintenir si une carte a besoin
-- d'un nouveau champ public plus tard, au lieu de dupliquer la liste dans
-- chaque fonction. Ne renvoie jamais : user_id, ban_reason, suspend_reason,
-- flagged_for_review, report_count, deletion_requested_at, birth_date,
-- notification_preferences, pref_*, onboarding_*, usage_goals, last_name,
-- province, created_at.
-- ----------------------------------------------------------------------------
create or replace function public.profile_public_json(p profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'avatar_url', p.avatar_url,
    'cover_url', p.cover_url,
    'age', p.age,
    'show_birth_year', p.show_birth_year,
    'city', p.city,
    'show_city', p.show_city,
    'country', p.country,
    'show_country', p.show_country,
    'arrived_since', p.arrived_since,
    'immigration_status', p.immigration_status,
    'arrival_city', p.arrival_city,
    'show_canada_journey', p.show_canada_journey,
    'looking_for', p.looking_for,
    'relationship_values', p.relationship_values,
    'languages', p.languages,
    'languages_detail', p.languages_detail,
    'occupation', p.occupation,
    'show_occupation', p.show_occupation,
    'education_level', p.education_level,
    'show_studies', p.show_studies,
    'interests', p.interests,
    'show_interests', p.show_interests,
    'wants_children', p.wants_children,
    'family_importance', p.family_importance,
    'career_goal', p.career_goal,
    'geographic_openness', p.geographic_openness,
    'show_life_project', p.show_life_project,
    'bio', p.bio,
    'email_verified', p.email_verified,
    'phone_verified', p.phone_verified,
    'is_founder', p.is_founder,
    'is_premium', p.is_premium,
    'is_online', p.is_online,
    'last_seen', p.last_seen,
    'show_online_status', p.show_online_status,
    'banned_at', p.banned_at,
    'suspended_until', p.suspended_until
  );
$$;

-- ----------------------------------------------------------------------------
-- 1. get_my_likers() — même logique d'autorisation qu'avant (inchangée),
-- seule la projection de colonnes change (to_jsonb(p.*) -> profile_public_json(p)).
-- ----------------------------------------------------------------------------
create or replace function get_my_likers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
  v_premium boolean;
  v_likers jsonb;
  v_admirers_count int;
begin
  if v_me is null then
    return jsonb_build_object('likers', '[]'::jsonb, 'admirers_count', 0);
  end if;

  v_premium := is_premium(v_me);

  select coalesce(jsonb_agg(profile_public_json(p)), '[]'::jsonb)
  into v_likers
  from likes l
  join profiles p on p.id = l.from_id
  where l.to_id = v_me
    and (
      v_premium
      or exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id)
    );

  select count(*) into v_admirers_count
  from likes l
  where l.to_id = v_me
    and not exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id);

  return jsonb_build_object('likers', v_likers, 'admirers_count', v_admirers_count);
end;
$$;

grant execute on function get_my_likers() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. get_liker_profile_reveal(p_from_id) — même changement.
-- ----------------------------------------------------------------------------
create or replace function get_liker_profile_reveal(p_from_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
begin
  if v_me is null or p_from_id is null then
    return null;
  end if;

  if not exists (select 1 from likes where from_id = p_from_id and to_id = v_me) then
    return null;
  end if;

  if is_premium(v_me) or exists (select 1 from likes where from_id = v_me and to_id = p_from_id) then
    return (select profile_public_json(p) from profiles p where p.id = p_from_id);
  end if;

  return null;
end;
$$;

grant execute on function get_liker_profile_reveal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select get_my_likers(); -- en tant qu'utilisateur connecté
-- select jsonb_object_keys((get_my_likers()->'likers'->0)); -- doit lister
--   uniquement les clés de profile_public_json ci-dessus, jamais ban_reason/
--   birth_date/report_count/etc.
-- ============================================================================
