import React from "react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import EmptyState from "../home/EmptyState";
import { primary, gold, muted } from "./theme";

const STATUS_BADGE = {
  interested: { label: "Intéressé(e)", color: gold, bg: "var(--bb-surface-2)" },
  waitlisted: { label: "Liste d'attente", color: gold, bg: "var(--bb-surface-2)" },
};

// Photo + prénom seulement, jamais email/téléphone/adresse — même
// discipline que PublicProfileModal. blockedIds filtre le blocage dans
// les deux sens (aucun système existant à réutiliser ici, voir rapport).
export default function EventParticipantsList({ participants = [], blockedIds = new Set(), onViewProfile }) {
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
        return (
          <button key={p.id} onClick={() => onViewProfile(profile)} className="flex items-center gap-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2">
            <Avatar name={profile.name} url={profile.avatar_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: primary }}>
                <span dir="auto">{firstName}</span>
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
