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
