import React from "react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import EmptyState from "../home/EmptyState";
import { primary, goldText, muted } from "./theme";

const STATUS_BADGE = {
  interested: { label: "Intéressé(e)", color: goldText, bg: "var(--bb-surface-2)" },
  waitlisted: { label: "Liste d'attente", color: goldText, bg: "var(--bb-surface-2)" },
};

// Photo + prénom seulement, jamais email/téléphone/adresse — même
// discipline que PublicProfileModal. blockedIds filtre le blocage dans
// les deux sens (aucun système existant à réutiliser ici, voir rapport).
export default function EventParticipantsList({ participants = [], blockedIds = new Set(), onViewProfile, currentUserId }) {
  const visible = participants.filter((p) => !blockedIds.has(p.profile_id));

  if (visible.length === 0) {
    return <EmptyState title="Aucun participant pour l'instant." subtitle="Sois le/la premier·ère à rejoindre !" />;
  }

  return (
    <div className="flex flex-col gap-1">
      {visible.map((p) => {
        const profile = p.profiles || {};
        // "name" est déjà le prénom seul (Step1Identity.jsx sépare "Nom" de
        // famille dans last_name) — split(" ")[0] coupait à tort un prénom
        // composé sans trait d'union ("Marie Claude", "Ana Maria") au
        // premier mot ; truncate (ligne ci-dessous) gère déjà le débordement.
        const firstName = (profile.name || "").trim() || "?";
        const badge = STATUS_BADGE[p.status];
        const isSelf = p.profile_id === currentUserId;
        return (
          // Bug corrigé à l'audit du flux de signalement : sans la garde
          // `isSelf` ci-dessous, cliquer sur sa propre ligne dans la liste
          // des participant·es ouvrait PublicProfileModal sur son propre
          // profil avec les boutons Signaler/Bloquer/Message actifs (ce
          // composant ne recevait même pas `currentUserId` avant ce
          // correctif). Même motif et même correctif que CommunityMemberRow.
          <button
            key={p.id}
            onClick={() => { if (!isSelf) onViewProfile(profile); }}
            aria-label={isSelf ? `${firstName} (toi)` : undefined}
            className="flex items-center gap-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2"
          >
            <Avatar name={profile.name} url={profile.avatar_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: primary }}>
                <span dir="auto">{firstName}</span>
                {isSelf && <span className="text-xs font-normal" style={{ color: muted }}>(toi)</span>}
                {/* Parité de badges (bug corrigé à l'audit, même famille que
                    CommunityMemberRow) : champs désormais chargés dans
                    loadParticipants() (EventsTab.jsx). */}
                <StatusBadge isFounder={profile.is_founder} isPremium={profile.is_premium} emailVerified={profile.email_verified} phoneVerified={profile.phone_verified} size={12} />
              </div>
              {profile.show_city !== false && profile.city && <div className="text-xs truncate" style={{ color: muted }}>📍 {profile.city}</div>}
            </div>
            {badge && (
              <span className="text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0" style={{ background: badge.bg, border: "1px solid var(--bb-border)", color: badge.color }}>
                {badge.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
