-- BAOBAB — Module Géolocalisation
-- Table séparée de "profiles" à dessein : "profiles" est chargé en entier
-- côté client pour tout le monde (supabase.from("profiles").select("*")
-- dans App.jsx loadAll()), donc toute colonne lat/lng posée directement sur
-- "profiles" serait visible par tous les utilisateurs connectés. Ici, RLS
-- restreint la lecture à la ligne du propriétaire uniquement ; la distance
-- vers un autre utilisateur passe exclusivement par la fonction RPC
-- ci-dessous (security definer), qui ne renvoie jamais de coordonnées brutes.

create table if not exists public.user_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  city text,
  region text,
  country text,
  latitude_approx numeric(6,2),
  longitude_approx numeric(6,2),
  location_enabled boolean not null default false,
  show_general_area boolean not null default true,
  use_for_recommendations boolean not null default true,
  use_for_events boolean not null default true,
  use_for_dating boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_locations enable row level security;

drop policy if exists "user_locations_select_own" on public.user_locations;
create policy "user_locations_select_own" on public.user_locations for select using (auth.uid() = user_id);

drop policy if exists "user_locations_insert_own" on public.user_locations;
create policy "user_locations_insert_own" on public.user_locations for insert with check (auth.uid() = user_id);

drop policy if exists "user_locations_update_own" on public.user_locations;
create policy "user_locations_update_own" on public.user_locations for update using (auth.uid() = user_id);

drop policy if exists "user_locations_delete_own" on public.user_locations;
create policy "user_locations_delete_own" on public.user_locations for delete using (auth.uid() = user_id);

-- Renvoie uniquement id de profil + distance en km, jamais de coordonnées —
-- security definer nécessaire pour comparer la position de l'appelant à
-- celle des autres sans leur donner un accès SELECT direct à la table.
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
