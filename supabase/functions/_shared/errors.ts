// Erreur "attendue" — son message est déjà rédigé en français pour
// l'utilisateur et peut être renvoyé tel quel. Toute autre exception
// (SDK Stripe, erreur Postgres brute, etc.) doit être journalisée côté
// serveur puis remplacée par un message générique avant d'atteindre le
// client, pour ne jamais exposer de détail interne.
export class UserError extends Error {}

export function toUserMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  console.error(e);
  return "Une erreur est survenue. Réessaie dans quelques instants.";
}
