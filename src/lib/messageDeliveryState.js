// État d'accusé de réception affiché sur un message ENVOYÉ par
// l'utilisateur courant (ConversationPane.jsx) — extrait en fonction pure
// pour être testable sans monter tout le composant (celui-ci dépend
// lourdement de Supabase/realtime, difficile à monter en isolation).
//
// Trois états (mission messagerie temps réel, 15 sept.), dans cet ordre :
// - "sent" (1 coche) : le message existe en base, rien de plus à en dire.
// - "delivered" (2 coches grises) : pas encore lu, mais le destinataire est
//   actuellement en ligne (voir lib/presence.js) — PAS un accusé de remise
//   persisté façon WhatsApp (aucune colonne delivered_at), juste un reflet
//   de la présence live du destinataire au moment de l'affichage, cohérent
//   avec le point vert "En ligne" de l'en-tête qui utilise la même donnée.
// - "read" (2 coches bleues) : `read_at` posé ET la réciprocité de
//   confidentialité respectée (voir plus bas).
//
// Réciprocité "ne pas afficher mes accusés de lecture" (show_read_receipts,
// PrivacyFieldsModal.jsx) : `readAt` lui-même n'est écrit par le LECTEUR
// (App.jsx, markConversationRead) que si SON propre show_read_receipts est
// actif — donc `readAt` déjà non-null implique que le lecteur avait
// l'option active. Le paramètre `showReadReceipts` ici est celui de
// l'EXPÉDITEUR (qui regarde son propre message envoyé) : comme sur
// WhatsApp, si l'expéditeur a désactivé l'option, il ne voit pas non plus
// les coches bleues des autres, même si le message a bien été lu.
export function getMessageCheckState({ readAt, showReadReceipts, otherOnline }) {
  const read = Boolean(readAt) && showReadReceipts !== false;
  if (read) return "read";
  if (otherOnline) return "delivered";
  return "sent";
}
