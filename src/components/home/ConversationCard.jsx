import React from "react";
import { MessageCircle } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import { coral, muted, online, offline } from "../social/theme";

export default function ConversationCard({ match, onOpen }) {
  return (
    <button
      onClick={() => onOpen(match)}
      aria-label={`Ouvrir la conversation avec ${match.name}`}
      className="w-full flex items-center gap-3 text-left rounded-xl p-2 -m-2 transition-colors hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      <div style={{ position: "relative" }}>
        <Avatar name={match.name} url={match.avatar_url} size={44} />
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
          style={{ background: match.is_online ? online : offline }}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold truncate flex items-center gap-1.5">
          {match.name}
          <StatusBadge emailVerified={match.email_verified} phoneVerified={match.phone_verified} isFounder={match.is_founder} isPremium={match.is_premium} size={12} />
        </div>
        {/* Confidentialité par champ (voir PrivacyFieldsModal.jsx) — cette carte
            affichait la ville du match sans consulter show_city, alors que
            MatchCard/PublicProfileModal le respectent déjà. */}
        <div className="text-xs truncate" style={{ color: muted }}>{match.is_online ? "En ligne" : ((match.show_city !== false && match.city) || "Canada")}</div>
      </div>
      <MessageCircle size={16} color={coral} aria-hidden="true" />
    </button>
  );
}
