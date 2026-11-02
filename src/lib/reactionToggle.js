// Réaction d'un utilisateur sur un message — règle « une réaction par
// personne et par message » (comme WhatsApp) :
//   - même emoji que ma réaction actuelle -> je la retire ;
//   - autre emoji -> il REMPLACE ma réaction actuelle (pas d'accumulation).
// La table message_reactions a pour clé (message_id, profile_id, emoji) : la
// base accepterait plusieurs emojis par personne, c'est donc au client de
// garder une seule réaction — sinon le même utilisateur finissait avec 3 ou 4
// pastilles différentes sur un seul message.
//
// Fonction pure : renvoie la nouvelle liste et les opérations serveur à jouer.

/**
 * @param {Array<{profile_id:string, emoji:string}>} list réactions actuelles du message
 * @returns {{ next: Array, removeEmojis: string[], addEmoji: string|null }}
 */
export function planReactionToggle(list, userId, emoji) {
  const current = Array.isArray(list) ? list : [];
  const mine = current.filter((r) => r.profile_id === userId);
  const others = current.filter((r) => r.profile_id !== userId);
  if (mine.some((r) => r.emoji === emoji)) {
    return { next: [...others, ...mine.filter((r) => r.emoji !== emoji)], removeEmojis: [emoji], addEmoji: null };
  }
  return {
    next: [...others, { profile_id: userId, emoji }],
    removeEmojis: mine.map((r) => r.emoji),
    addEmoji: emoji,
  };
}
