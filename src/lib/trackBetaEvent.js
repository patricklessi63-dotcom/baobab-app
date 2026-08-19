import { supabase } from "../supabaseClient";

// Journal d'événements beta (Phase 2 — préparation beta privée), distinct de
// trackActivation (jalons uniques par profil) : ici un même event_type peut
// se répéter (vues d'écran, actions) — voir supabase-beta-tracking.sql.
// Même motif "ne jamais lever" que trackActivation/invokeAI : le suivi ne
// doit jamais faire échouer l'action réelle de l'utilisateur.
export async function trackBetaEvent(profileId, eventType, meta = null) {
  if (!profileId || !eventType) return;
  try {
    await supabase.from("beta_events").insert({ profile_id: profileId, event_type: eventType, meta });
  } catch (_) {
    // Silencieux, intentionnel — jamais remonté à l'utilisateur.
  }
}
