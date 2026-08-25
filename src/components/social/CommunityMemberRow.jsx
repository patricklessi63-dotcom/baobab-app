import React from "react";
import { ChevronUp, ChevronDown, UserMinus } from "lucide-react";
import Avatar from "../Avatar";
import { roleLabel } from "../../lib/communities/communityConfig";
import { canSetRole, canRemoveMember } from "../../lib/communities/permissions";
import { primary, coral, gold, muted, navy } from "./theme";

export default function CommunityMemberRow({ member, viewerRole, currentUserId, onViewProfile, onSetRole, onRemove }) {
  const profile = member.profiles || {};
  const firstName = (profile.name || "").trim().split(" ")[0] || "?";
  const isSelf = member.profile_id === currentUserId;
  const canPromoteToMod = canSetRole(viewerRole, member.role, "moderator") && member.role === "member";
  const canDemoteToMember = canSetRole(viewerRole, member.role, "member") && member.role === "moderator";
  const canRemove = canRemoveMember(viewerRole, member.role, isSelf) && !isSelf;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <button onClick={() => onViewProfile(profile)} className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2">
        <Avatar name={profile.name} url={profile.avatar_url} size={40} />
        <div className="min-w-0">
          <div className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: primary }}>
            {firstName}
            {member.role !== "member" && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: member.role === "owner" ? "#FFF3D6" : "#EEF2FF", color: member.role === "owner" ? gold : navy }}>
                {roleLabel(member.role)}
              </span>
            )}
          </div>
          {profile.show_city !== false && profile.city && <div className="text-xs truncate" style={{ color: muted }}>📍 {profile.city}</div>}
        </div>
      </button>
      {(canPromoteToMod || canDemoteToMember || canRemove) && (
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
          {canRemove && (
            <button
              onClick={() => window.confirm(`Retirer ${firstName} de cette communauté ?`) && onRemove(member)}
              aria-label={`Retirer ${firstName} de la communauté`}
              className="h-8 w-8 rounded-full flex items-center justify-center"
              style={{ color: coral }}
            >
              <UserMinus size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
