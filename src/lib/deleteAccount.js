import { supabase } from "../supabaseClient";

// Délai de grâce de 24h (remplace l'ancienne suppression immédiate,
// Phase 10 item 38 ; réduit de 7 jours à 24h sur demande explicite) — la
// suppression réelle (Storage inclus) est traitée par la tâche planifiée
// pg_cron/pg_net, voir process-scheduled-deletions et
// supabase-account-deletion.sql. Ces deux fonctions ne font qu'écrire/
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

// Confirmation par mot de passe avant de programmer la suppression : une session ouverte sur un
// téléphone prêté ou oublié ne doit pas suffire à demander la suppression du compte. On rejoue une
// connexion avec l'adresse de la session et le mot de passe saisi ; si le serveur le refuse, rien
// n'est programmé. Se reconnecter avec le même compte n'a aucun effet visible : App.jsx ignore les
// évènements d'authentification qui concernent l'utilisateur déjà connecté.
export async function verifyPasswordForDeletion(password) {
  if (!password) throw new Error("Saisis ton mot de passe pour confirmer.");
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (!email) throw new Error("Impossible de vérifier ton identité. Reconnecte-toi puis réessaie.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return;
  if (error.status === 429 || /rate limit|too many/i.test(error.message || "")) {
    throw new Error("Trop de tentatives. Réessaie dans quelques minutes.");
  }
  if (error.status === 400 || /invalid login credentials/i.test(error.message || "")) {
    throw new Error("Mot de passe incorrect.");
  }
  throw new Error("Impossible de vérifier ton mot de passe. Vérifie ta connexion et réessaie.");
}
