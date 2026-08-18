import { supabase } from "../supabaseClient";

// Délai de grâce de 7 jours (remplace l'ancienne suppression immédiate,
// Phase 10 item 38) — la suppression réelle (Storage inclus) est traitée
// par la tâche planifiée pg_cron/pg_net, voir process-scheduled-deletions
// et supabase-account-deletion.sql. Ces deux fonctions ne font qu'écrire/
// effacer un timestamp — la RLS existante sur profiles suffit, aucune Edge
// Function n'est nécessaire ici.
export async function requestAccountDeletion(profileId) {
  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error("Impossible d'enregistrer la demande de suppression.");
}

export async function cancelAccountDeletion(profileId) {
  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", profileId);
  if (error) throw new Error("Impossible d'annuler la suppression.");
}
