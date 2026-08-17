import React from "react";
import { MapPin, Users, Lock, Users2 } from "lucide-react";
import { categoryIcon, categoryLabel } from "../../lib/events/eventConfig";
import { formatEventWhen } from "../../utils/format";
import { primary, green, coral, gold, bg, muted, card } from "./theme";

// Déplacée de src/components/home/EventCard.jsx (Phase 5) vers social/ —
// même déplacement que CommunityGroupCard en Phase 6, pour rester
// cohérent avec le reste des cartes de liste. Compteur de participants
// toujours réel (event.participantCount, jamais inventé).
export default function EventCard({ event, participantCount = 0, status, onView }) {
  const isPrivate = event.visibility === "private";
  const isCommunity = event.visibility === "community";
  const full = event.max_participants != null && participantCount >= event.max_participants;

  let badge = null;
  if (status === "going") {
    badge = <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "#EEF8F4", color: green }}>Tu participes ✓</span>;
  } else if (status === "waitlisted") {
    badge = <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "#FFF3D6", color: gold }}>Liste d'attente</span>;
  } else if (full) {
    badge = <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: bg, color: muted }}>Complet</span>;
  }

  return (
    <button onClick={() => onView(event)} className={`${card} overflow-hidden text-left w-full focus-visible:outline focus-visible:outline-2`}>
      <div className="h-28 relative" style={{ background: event.cover_url ? `url(${event.cover_url}) center/cover` : `linear-gradient(150deg,${gold},${coral})` }}>
        {isPrivate && (
          <span className="absolute top-2 right-2 h-7 w-7 rounded-full flex items-center justify-center" style={{ background: "rgba(21,27,61,.55)" }} aria-label="Événement privé">
            <Lock size={13} color="#fff" />
          </span>
        )}
        {isCommunity && !isPrivate && (
          <span className="absolute top-2 right-2 h-7 w-7 rounded-full flex items-center justify-center" style={{ background: "rgba(21,27,61,.55)" }} aria-label="Événement de communauté">
            <Users2 size={13} color="#fff" />
          </span>
        )}
        <span className="absolute bottom-2 left-2 text-xs font-black px-2.5 py-1 rounded-full text-white" style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(4px)" }}>
          {categoryIcon(event.category)} {categoryLabel(event.category)}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-black truncate" style={{ color: primary }}>{event.title}</h3>
        <div className="text-xs mt-1" style={{ color: muted }}>{formatEventWhen(event.event_date)}</div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3 text-[11px]" style={{ color: muted }}>
            {event.city && <span className="flex items-center gap-1"><MapPin size={11} /> {event.city}</span>}
            <span className="flex items-center gap-1"><Users size={11} /> {participantCount.toLocaleString("fr-CA")} participant{participantCount > 1 ? "s" : ""}</span>
          </div>
        </div>
        {badge && <div className="mt-3">{badge}</div>}
      </div>
    </button>
  );
}
