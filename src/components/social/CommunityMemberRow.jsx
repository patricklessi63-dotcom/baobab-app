import React, { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, UserMinus } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import ConfirmModal from "./ConfirmModal";
import { roleLabel } from "../../lib/communities/communityConfig";
import { canSetRole, canRemoveMember } from "../../lib/communities/permissions";
import { primary, coral, gold, muted } from "./theme";

export default function CommunityMemberRow({ member, viewerRole, currentUserId, onViewProfile, onSetRole, onRemove }) {
  // Remplace l'ancien window.confirm() de retrait — voir ConfirmModal.jsx.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const profile = member.profiles || {};
  // "name" est déjà le prénom seul (Step1Identity.jsx sépare "Nom" de
  // famille dans last_name) — split(" ")[0] coupait à tort un prénom
  // composé sans trait d'union ("Marie Claude", "Ana Maria") au premier
  // mot ; truncate (ligne ci-dessous) gère déjà le débordement visuel.
  const firstName = (profile.name || "").trim() || "?";
  const isSelf = member.profile_id === currentUserId;
  const canPromoteToMod = canSetRole(viewerRole, member.role, "moderator") && member.role === "member";
  const canDemoteToMember = canSetRole(viewerRole, member.role, "member") && member.role === "moderator";
  // Bug corrigé : le rôle "admin" existe bel et bien dans le modèle de
  // permissions (communityConfig.js, permissions.js, RLS "Changement de
  // rôle selon la hiérarchie" dans supabase-communities.sql — la branche
  // owner y est illimitée sur le rôle cible) mais aucun bouton ne
  // permettait jamais de l'atteindre : seules les paires membre<->modérateur
  // étaient câblées ici. Un·e propriétaire n'avait donc aucun moyen de
  // déléguer une administration complète, même en admin/gestion — il restait
  // le seul point de défaillance de sa communauté. canSetRole refuse déjà
  // ce changement à un simple admin (la cible doit être modérateur/membre),
  // donc ces boutons ne peuvent apparaître que pour un·e propriétaire.
  const canPromoteToAdmin = canSetRole(viewerRole, member.role, "admin") && member.role === "moderator";
  const canDemoteToModerator = canSetRole(viewerRole, member.role, "moderator") && member.role === "admin";
  const canRemove = canRemoveMember(viewerRole, member.role, isSelf) && !isSelf;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <button onClick={() => onViewProfile(profile)} className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2">
        <Avatar name={profile.name} url={profile.avatar_url} size={40} />
        <div className="min-w-0">
          <div className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: primary }}>
            <span dir="auto">{firstName}</span>
            {/* Parité de badges (bug corrigé à l'audit, même famille que
                PublicProfileModal/AdmirersModal/FavoritesModal) : les champs
                sont désormais chargés dans loadMembers() (CommunitiesTab.jsx). */}
            <StatusBadge isFounder={profile.is_founder} isPremium={profile.is_premium} emailVerified={profile.email_verified} phoneVerified={profile.phone_verified} size={12} />
            {member.role !== "member" && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: member.role === "owner" ? gold : primary }}>
                {roleLabel(member.role)}
              </span>
            )}
          </div>
          {profile.show_city !== false && profile.city && <div className="text-xs truncate" style={{ color: muted }}>📍 {profile.city}</div>}
        </div>
      </button>
      {(canPromoteToMod || canDemoteToMember || canPromoteToAdmin || canDemoteToModerator || canRemove) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {canPromoteToMod && (
            <button onClick={() => onSetRole(member, "moderator")} aria-label={`Promouvoir ${firstName} modérateur`} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ color: muted }}>
              <ChevronUp size={16} />
            </button>
          )}
          {canDemoteToMember && (
            <button onClick={() => onSetRole(member, "member")} aria-label={`Rétrograder ${firstName}`} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ color: muted }}>
              <ChevronDown size={16} />
            </button>
          )}
          {canPromoteToAdmin && (
            <button onClick={() => onSetRole(member, "admin")} aria-label={`Promouvoir ${firstName} administrateur`} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ color: gold }}>
              <ChevronsUp size={16} />
            </button>
          )}
          {canDemoteToModerator && (
            <button onClick={() => onSetRole(member, "moderator")} aria-label={`Rétrograder ${firstName} modérateur`} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ color: muted }}>
              <ChevronsDown size={16} />
            </button>
          )}
          {canRemove && (
            <button
              onClick={() => setConfirmingRemove(true)}
              aria-label={`Retirer ${firstName} de la communauté`}
              className="h-8 w-8 rounded-full flex items-center justify-center"
              style={{ color: coral }}
            >
              <UserMinus size={15} />
            </button>
          )}
        </div>
      )}
      <ConfirmModal
        open={confirmingRemove}
        title={`Retirer ${firstName} de cette communauté ?`}
        confirmLabel="Retirer"
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() => { onRemove(member); setConfirmingRemove(false); }}
      />
    </div>
  );
}
