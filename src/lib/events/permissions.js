// Miroir CLIENT des fonctions SQL is_event_staff/is_event_mod (voir
// supabase-events-v2.sql) — sert uniquement à l'affichage conditionnel des
// boutons (UX). La vraie source de vérité reste la RLS et les fonctions
// SECURITY DEFINER côté serveur ; ce fichier ne doit jamais être considéré
// comme une barrière de sécurité.

export function isEventStaff(role) {
  return role === "organizer" || role === "co_organizer";
}

export function isEventMod(role) {
  return role === "organizer" || role === "co_organizer" || role === "moderator";
}

export function canEditEvent(role) {
  return isEventStaff(role);
}

export function canManageEventStaff(role) {
  return role === "organizer";
}

export function canCancelEvent(role) {
  return isEventStaff(role);
}

// Miroir de la hiérarchie appliquée par la policy UPDATE de event_staff :
// un organizer peut tout faire ; un co_organizer ne peut promouvoir/
// rétrograder que vers "moderator", jamais toucher un autre organizer/
// co_organizer.
export function canSetEventRole(actorRole, newRole) {
  if (actorRole === "organizer") return true;
  if (actorRole === "co_organizer") return newRole === "moderator";
  return false;
}

export function canRemoveEventStaff(actorRole, targetRole, isSelf) {
  if (isSelf) return targetRole !== "organizer"; // le seul organisateur ne peut pas se retirer lui-même
  return actorRole === "organizer";
}
