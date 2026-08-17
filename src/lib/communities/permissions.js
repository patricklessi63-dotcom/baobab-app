// Miroir CLIENT des fonctions SQL is_community_staff/is_community_mod
// (voir supabase-communities.sql) — sert uniquement à l'affichage
// conditionnel des boutons (UX). La vraie source de vérité reste la RLS
// et les fonctions SECURITY DEFINER côté serveur ; ce fichier ne doit
// jamais être considéré comme une barrière de sécurité.

export function isStaff(role) {
  return role === "owner" || role === "admin";
}

export function isMod(role) {
  return role === "owner" || role === "admin" || role === "moderator";
}

export function isMember(role) {
  return Boolean(role);
}

export function canManageMembers(role) {
  return isStaff(role);
}

export function canModerate(role) {
  return isMod(role);
}

export function canPost(role) {
  return isMember(role);
}

export function canCreateCommunity() {
  return true; // tout utilisateur authentifié peut créer une communauté (item 12)
}

// Miroir de la hiérarchie appliquée par la policy UPDATE de
// community_members : un owner peut tout faire ; un admin ne peut définir
// que "moderator"/"member", et seulement sur une cible qui est déjà
// "moderator" ou "member" (jamais toucher un autre admin/owner).
export function canSetRole(actorRole, targetCurrentRole, newRole) {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") {
    return ["moderator", "member"].includes(targetCurrentRole) && ["moderator", "member"].includes(newRole);
  }
  return false;
}

export function canRemoveMember(actorRole, targetRole, isSelf) {
  if (isSelf) return true; // quitter est toujours permis
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return ["moderator", "member"].includes(targetRole);
  return false;
}
