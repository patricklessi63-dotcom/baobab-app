-- ============================================================================
-- Corrige un bug d'audit : le réglage "Afficher ma zone générale"
-- (show_general_area, LocationSettingsModal.jsx) était un interrupteur
-- purement cosmétique — présent dans la table user_locations et dans
-- l'interface, mais jamais lu nulle part dans le code (ni côté client, ni
-- dans la fonction nearby_profiles() ci-dessous). Un utilisateur qui le
-- désactivait pensait cacher sa position approximative, alors que son
-- profil continuait d'apparaître avec sa distance exacte en km dans le
-- filtre "📍 Personnes à proximité" de Découverte (seul appelant actuel de
-- nearby_profiles(), voir src/components/social/DiscoverTab.jsx).
--
-- À exécuter dans Supabase : SQL Editor, après supabase-geolocation.sql
-- (réécrit intégralement la fonction, aucune autre modification de schéma).
-- ============================================================================

create or replace function public.nearby_profiles(purpose text, max_km numeric default 50)
returns table(profile_id uuid, distance_km numeric)
language sql
security definer
set search_path = public
as $$
  select p.id as profile_id, d.distance_km
  from public.user_locations me
  cross join lateral (
    select ul.user_id,
      round((6371 * acos(greatest(-1, least(1,
        cos(radians(me.latitude_approx)) * cos(radians(ul.latitude_approx)) * cos(radians(ul.longitude_approx) - radians(me.longitude_approx))
        + sin(radians(me.latitude_approx)) * sin(radians(ul.latitude_approx))
      ))))::numeric, 1) as distance_km
    from public.user_locations ul
    where ul.user_id <> me.user_id
      and ul.location_enabled = true
      and ul.show_general_area = true  -- correction : ce réglage était ignoré
      and (
        (purpose = 'dating' and ul.use_for_dating = true)
        or (purpose = 'events' and ul.use_for_events = true)
        or (purpose = 'recommendations' and ul.use_for_recommendations = true)
      )
  ) d
  join public.profiles p on p.user_id = d.user_id
  where me.user_id = auth.uid()
    and me.location_enabled = true
    and d.distance_km <= max_km
  order by d.distance_km asc
  limit 100;
$$;

grant execute on function public.nearby_profiles(text, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname from pg_proc where proname = 'nearby_profiles';
-- ============================================================================
