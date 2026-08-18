import { supabase } from "../supabaseClient";

// Journal d'activation minimal (Phase 12a) — même motif "ne jamais lever"
// que invokeAI (src/lib/ai/aiClient.js) : l'action réelle (like, message,
// adhésion...) ne doit jamais échouer à cause d'un problème de tracking.
// La déduplication (une seule occurrence par type et par profil) est gérée
// côté base par unique(profile_id, event_type) — aucune vérification "est-ce
// la première fois ?" nécessaire ici, un doublon échoue silencieusement.
export async function trackActivation(profileId, eventType) {
  if (!profileId) return;
  try {
    await supabase.from("analytics_events").insert({ profile_id: profileId, event_type: eventType });
  } catch (_) {
    // Silencieux, intentionnel — jamais remonté à l'utilisateur.
  }
}
