import { supabase } from "../supabaseClient";

// Table séparée de "profiles" (voir supabase-geolocation.sql) — RLS n'y
// autorise que la lecture/écriture de sa propre ligne, donc ces appels ne
// peuvent jamais lire la position d'un autre utilisateur.
export async function fetchMyLocation() {
  const { data, error } = await supabase.from("user_locations").select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertMyLocation(fields) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data, error } = await supabase
    .from("user_locations")
    .upsert({ user_id: user.id, ...fields, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function disableMyLocation() {
  return upsertMyLocation({ location_enabled: false });
}

// Ne renvoie jamais de coordonnées — uniquement id de profil + distance
// approximative en km, via la fonction security definer nearby_profiles().
export async function fetchNearbyProfiles(purpose, maxKm = 50) {
  const { data, error } = await supabase.rpc("nearby_profiles", { purpose, max_km: maxKm });
  if (error) throw error;
  return data || [];
}
