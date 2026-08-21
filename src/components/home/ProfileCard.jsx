import React from "react";
import { Heart, X, MessageCircle } from "lucide-react";
import StatusBadge from "../StatusBadge";
import { visibleAge } from "../../utils/format";
import { coral, gold, green, muted, bg, primaryRgb } from "../social/theme";

export default function ProfileCard({
  profile,
  highlight,
  commonInterestsCount = 0,
  onLike,
  onPass,
  onMessage,
  compatibilityScore,
  matchReasons,
}) {
  const hasStatusBadge = Boolean(profile.is_founder || profile.email_verified || profile.phone_verified || profile.is_premium);
  const highlightText =
    highlight === "arrived_since" && profile.arrived_since
      ? `🇨🇦 Au Canada depuis ${profile.arrived_since}`
      : highlight === "looking_for" && profile.looking_for
      ? `❤️ ${profile.looking_for}`
      : null;

  return (
    <div
      className="group shrink-0 w-40 rounded-2xl overflow-hidden border bg-[var(--bb-surface)] transition-transform duration-200 hover:-translate-y-1 focus-within:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={profile.is_founder
        ? { borderColor: gold, borderWidth: 2, boxShadow: `0 0 0 1px ${gold}` }
        : { borderColor: `rgba(${primaryRgb},.08)` }}
    >
      <div className="h-28 relative overflow-hidden" style={{ background: `linear-gradient(150deg,${gold},${coral})` }}>
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.name ? `Photo de ${profile.name}` : "Photo de profil"}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-3xl" aria-hidden="true">🌍</div>
        )}
        {hasStatusBadge && (
          <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white/90 flex items-center justify-center">
            <StatusBadge isFounder={profile.is_founder} emailVerified={profile.email_verified} phoneVerified={profile.phone_verified} isPremium={profile.is_premium} size={13} />
          </span>
        )}
        {typeof compatibilityScore === "number" && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-black text-white"
            style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}
            title="Compatibilité estimée — pas une garantie"
          >
            ~{compatibilityScore}%
          </span>
        )}
      </div>

      <div className="p-3">
        <div className="text-sm font-bold truncate">{profile.name}{visibleAge(profile) ? `, ${visibleAge(profile)}` : ""}</div>
        {profile.city && <div className="text-[11px] truncate mt-0.5" style={{ color: muted }}>{profile.city}</div>}
        {highlightText && <div className="text-[11px] mt-1 truncate" style={{ color: coral }}>{highlightText}</div>}
        {commonInterestsCount > 0 && (
          <div className="text-[10px] mt-1 truncate font-semibold" style={{ color: green }}>
            {commonInterestsCount} centre{commonInterestsCount > 1 ? "s" : ""} d'intérêt en commun
          </div>
        )}
        {Array.isArray(matchReasons) && matchReasons[0] && (
          <div className="text-[10px] mt-1 truncate" style={{ color: muted }} title={matchReasons[0]}>
            🌱 {matchReasons[0]}
          </div>
        )}

        {(onPass || onLike || onMessage) && (
          <div className="flex gap-1.5 mt-2.5">
            {onPass && (
              <button
                onClick={() => onPass(profile)}
                aria-label={`Passer le profil de ${profile.name}`}
                className="flex-1 rounded-lg py-2.5 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                style={{ background: bg, color: muted }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
            {onLike && (
              <button
                onClick={() => onLike(profile)}
                aria-label={`Aimer le profil de ${profile.name}`}
                className="flex-1 rounded-lg py-2.5 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                style={{ background: "#FFF3F1", color: coral }}
              >
                <Heart size={12} aria-hidden="true" /> J'aime
              </button>
            )}
            {onMessage && (
              <button
                onClick={() => onMessage(profile)}
                aria-label={`Envoyer un message à ${profile.name}`}
                className="flex-1 rounded-lg py-2.5 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                style={{ background: "#EEF8F4", color: green }}
              >
                <MessageCircle size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
