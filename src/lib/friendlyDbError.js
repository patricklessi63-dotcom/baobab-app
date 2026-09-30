// Les triggers serveur (limites de débit, quotas Premium...) lèvent déjà des
// exceptions en français directement exploitables (code Postgres P0001),
// parfois préfixées d'un code technique ("FREE_MESSAGE_LIMIT_REACHED: ...").
// Sans extraire ce message, l'app ne peut afficher qu'un texte générique
// ("Réessaie"), qui masque la vraie raison (ex. limite de débit atteinte) et
// fait relancer en boucle une action qui échouera à l'identique.
export function friendlyDbError(e) {
  if (e?.code !== "P0001") return null;
  return (e.message || "").replace(/^[A-Z_]+:\s*/, "") || null;
}

// Certains codes techniques ci-dessus ne signalent pas une erreur transitoire
// (réessayer plus tard fonctionnera) mais un blocage PERMANENT tant que
// l'utilisateur n'a pas changé de statut (ex. FREE_MESSAGE_LIMIT_REACHED /
// PREMIUM_MEDIA_REQUIRED — voir supabase-premium-messaging.sql) : sans
// distinguer ce cas, l'appelant ne peut pas éviter de proposer un simple
// "Réessayer" qui échouera à l'identique (et, pour un média, re-uploade le
// fichier en pure perte) au lieu d'orienter vers la page Premium.
export function dbErrorCode(e) {
  if (e?.code !== "P0001") return null;
  const match = /^([A-Z_]+):/.exec(e.message || "");
  return match ? match[1] : null;
}
