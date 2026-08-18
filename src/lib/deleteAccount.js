import { supabase } from "../supabaseClient";

// Suppression réelle et définitive (Phase 10, item 38) — jamais simulée.
// Voir supabase/functions/delete-account pour ce qui est effectivement
// supprimé (profil + cascade base de données + abonnement Stripe annulé +
// compte d'authentification) et la limite connue (fichiers Storage non
// nettoyés cette phase).
export async function deleteAccountPermanently() {
  const { data, error } = await supabase.functions.invoke("delete-account");
  if (error) throw new Error("Impossible de supprimer le compte. Réessaie.");
  if (data?.error) throw new Error(data.error);
  return true;
}
