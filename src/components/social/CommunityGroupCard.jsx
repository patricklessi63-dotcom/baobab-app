import React from "react";
import { MapPin, Users, Lock, Mail } from "lucide-react";
import { categoryIcon, categoryLabel } from "../../lib/communities/communityConfig";
import { primary, green, coral, gold, bg, muted, card, primaryRgb } from "./theme";

// Nommée "CommunityGroupCard" (pas "CommunityCard") pour éviter la
// collision avec src/components/home/CommunityCard.jsx, qui est un
// concept différent (carte "N personnes dans cette ville").
export default function CommunityGroupCard({ community, memberCount = 0, joined, pending, onView, onJoin }) {
  const isPrivate = community.visibility === "private";
  const isInviteOnly = community.visibility === "invite_only";

  let cta = null;
  if (joined) {
    cta = <span className="text-xs font-bold px-3 py-2 rounded-full" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: green }}>Membre</span>;
  } else if (isInviteOnly) {
    cta = <span className="text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" style={{ background: bg, color: muted }}><Mail size={12} /> Sur invitation</span>;
  } else if (pending) {
    cta = <span className="text-xs font-bold px-3 py-2 rounded-full" style={{ background: bg, color: muted }}>Demande envoyée</span>;
  } else {
    cta = (
      <button
        onClick={(e) => { e.stopPropagation(); onJoin(community); }}
        className="bb-btn-gold text-xs font-bold px-4 py-2 rounded-full"
      >
        {isPrivate ? "Demander à rejoindre" : "Rejoindre"}
      </button>
    );
  }

  return (
    <button onClick={() => onView(community)} className={`${card} overflow-hidden text-left w-full focus-visible:outline focus-visible:outline-2`}>
      <div className="h-28 relative" style={{ background: community.cover_url ? `url(${community.cover_url}) center/cover` : `linear-gradient(150deg,${gold},${coral})` }}>
        {isPrivate && (
          <span className="absolute top-2 right-2 h-7 w-7 rounded-full flex items-center justify-center" style={{ background: `rgba(${primaryRgb},.55)` }} aria-label="Communauté privée">
            <Lock size={13} color="#fff" />
          </span>
        )}
        <span className="absolute bottom-2 left-2 text-xs font-black px-2.5 py-1 rounded-full text-white" style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}>
          {categoryIcon(community.category)} {categoryLabel(community.category)}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-black truncate" style={{ color: primary }}>{community.name}</h3>
        {community.description && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: muted }}>{community.description}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3 text-[11px]" style={{ color: muted }}>
            {community.city && <span className="flex items-center gap-1"><MapPin size={11} /> {community.city}</span>}
            <span className="flex items-center gap-1"><Users size={11} /> {memberCount.toLocaleString("fr-CA")} membre{memberCount > 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="mt-3">{cta}</div>
      </div>
    </button>
  );
}
