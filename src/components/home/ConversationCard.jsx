import React from "react";
import { MessageCircle } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import { coral, coralText, muted, leafLight, offline } from "../social/theme";
import { isUserOnline } from "../../lib/presence";

export default function ConversationCard({ match, onOpen }) {
  // Bug corrigé à l'audit : même correctif que ConversationPane.jsx/
  // MessagesTab.jsx (banned_at/suspended_until déjà présents sur `match`,
  // voir App.jsx — OTHER_PROFILE_COLUMNS) mais jamais appliqué ici. Ce
  // widget "Tes conversations" de l'accueil continuait d'afficher le point
  // vert pulsant "En ligne" pour un compte banni ou suspendu par un·e
  // admin, comme si de rien n'était.
  const unavailable =
    Boolean(match.banned_at) || Boolean(match.suspended_until && new Date(match.suspended_until) > new Date());
  // isUserOnline (pas match.is_online brut) : demande explicite du 15 sept.
  // — is_online peut rester bloqué à true en base après une session terminée
  // brutalement (crash, coupure réseau), voir lib/presence.js.
  const online = !unavailable && isUserOnline(match);
  return (
    <button
      onClick={() => onOpen(match)}
      aria-label={`Ouvrir la conversation avec ${match.name}`}
      className="w-full flex items-center gap-3 text-left rounded-xl p-2 -m-2 transition-colors hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      <div style={{ position: "relative" }}>
        <Avatar name={match.name} url={match.avatar_url} size={44} />
        {!unavailable && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white${online ? " bb-online-pulse" : ""}`}
            style={{ background: online ? leafLight : offline }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold truncate flex items-center gap-1.5">
          <span dir="auto" className="truncate">{match.name}</span>
          <StatusBadge emailVerified={match.email_verified} phoneVerified={match.phone_verified} isFounder={match.is_founder} isPremium={match.is_premium} size={12} />
        </div>
        {/* Confidentialité par champ (voir PrivacyFieldsModal.jsx) — cette carte
            affichait la ville du match sans consulter show_city, alors que
            MatchCard/PublicProfileModal le respectent déjà. */}
        <div className="text-xs truncate" style={{ color: unavailable ? coralText : muted }}>
          {unavailable ? "Ce compte n'est plus disponible" : (online ? "En ligne" : ((match.show_city !== false && match.city) || "Canada"))}
        </div>
      </div>
      <MessageCircle size={16} color={coral} aria-hidden="true" />
    </button>
  );
}
