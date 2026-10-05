// Un événement PRIVÉ dont la personne a refusé l'invitation (ou dont le staff
// a révoqué la sienne — même statut "declined", voir
// "Le staff revoque une invitation" dans supabase-events-v2.sql) ne doit plus
// lui être affiché, sauf si elle y a par ailleurs une vraie place
// (participant·e, ou créateur·rice).
//
// can_view_event() (SQL) laisse aujourd'hui passer toute ligne
// event_invitations quel que soit son statut : sans ce filtre client,
// l'événement continuait d'apparaître dans la liste après un refus. Le vrai
// correctif est côté SQL (voir DEPLOIEMENT.md) ; ceci en est le miroir
// d'affichage, inoffensif une fois le SQL appliqué (la RLS ne renvoie alors
// plus l'événement du tout).
export function isHiddenByDeclinedInvite(event, { declinedIds, myStatuses = {}, currentUserId }) {
  if (!event || event.visibility !== "private") return false;
  if (!declinedIds || !declinedIds.has(event.id)) return false;
  if (currentUserId && event.created_by === currentUserId) return false;
  const status = myStatuses[event.id];
  if (status === "going" || status === "interested" || status === "waitlisted") return false;
  return true;
}
