import React from "react";
import { Heart, X, MessageCircle, Star, Flag, Ban, EyeOff, HeartCrack } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import { visibleAge } from "../../utils/format";
import { primary, green, coral, gold, bg, muted, card, body, primaryRgb } from "./theme";

export default function MatchCard({
  profile,
  match,
  isMatch = false,
  isFavorite = false,
  onLike,
  onPass,
  onMessage,
  onToggleFavorite,
  onReport,
  onBlock,
  onUnmatch,
  onHide,
  onViewProfile,
  distanceKm,
}) {
  const compatColor = match.level === "high" ? green : match.level === "medium" ? gold : muted;
  const reasons = match.reasons.slice(0, 4);
  // Confidentialité par champ (voir PrivacyFieldsModal.jsx) — cette carte
  // (mode grille "Pour toi" de Découverte) affichait la ville sans jamais
  // consulter ce réglage, contrairement au mode Pile (DiscoverTab.jsx) et à
  // PublicProfileModal.jsx qui le respectent déjà : un profil masquant sa
  // ville restait quand même visible ici.
  const showCity = profile.show_city !== false;

  return (
    <div className={`${card} overflow-hidden flex flex-col`}>
      <button onClick={() => onViewProfile?.(profile)} className="relative h-48 w-full text-left focus-visible:outline focus-visible:outline-2">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.name ? `Photo de ${profile.name}` : "Photo de profil"} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(150deg,${gold},${coral})` }}>
            <Avatar name={profile.name} url={null} size={72} />
          </div>
        )}
        <span
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-black text-white"
          style={{ background: `rgba(${primaryRgb},.6)`, backdropFilter: "blur(4px)" }}
        >
          ~{match.score}%
        </span>
      </button>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-black truncate" style={{ color: primary }}>{profile.name}{visibleAge(profile) ? `, ${visibleAge(profile)}` : ""}</h3>
          <StatusBadge emailVerified={profile.email_verified} phoneVerified={profile.phone_verified} isFounder={profile.is_founder} isPremium={profile.is_premium} size={14} />
        </div>
        {(showCity && profile.city) || typeof distanceKm === "number" ? (
          <p className="text-xs mt-0.5" style={{ color: muted }}>
            📍 {showCity && profile.city ? profile.city : ""}{typeof distanceKm === "number" ? `${showCity && profile.city ? " · " : ""}à environ ${distanceKm} km` : ""}
          </p>
        ) : null}

        <div className="flex items-center justify-between mt-2">
          {profile.looking_for && (
            <span className="text-[11px] font-bold truncate" style={{ color: coral }}>❤️ {profile.looking_for.split(",")[0].trim()}</span>
          )}
          <span className="text-[11px] font-bold shrink-0" style={{ color: compatColor }}>Compatibilité estimée</span>
        </div>

        {match.commonInterests.length > 0 && (
          <p className="text-[11px] mt-1 font-semibold" style={{ color: green }}>
            {match.commonInterests.length} intérêt{match.commonInterests.length > 1 ? "s" : ""} en commun
          </p>
        )}

        <div className="mt-3 rounded-xl p-3" style={{ background: bg }}>
          <div className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: primary }}>
            ✨ Pourquoi {profile.name} pourrait te correspondre
          </div>
          <ul className="space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: body }}>
                <span style={{ color: green }} aria-hidden="true">✓</span>{r}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {onPass && (
            <button onClick={() => onPass(profile)} aria-label={`Passer le profil de ${profile.name}`} className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: bg }}>
              <X size={16} color={muted} />
            </button>
          )}
          {onLike && (
            <button onClick={() => onLike(profile)} aria-label={`Aimer le profil de ${profile.name}`} className="flex-1 rounded-full py-2.5 text-sm font-bold text-white flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2" style={{ background: coral }}>
              <Heart size={15} /> J'aime
            </button>
          )}
          {isMatch && onMessage && (
            <button onClick={() => onMessage(profile)} aria-label={`Envoyer un message à ${profile.name}`} className="flex-1 rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2" style={{ background: "#EEF8F4", color: green }}>
              <MessageCircle size={15} /> Message
            </button>
          )}
          {onToggleFavorite && (
            <button onClick={() => onToggleFavorite(profile)} aria-label={`Ajouter ${profile.name} aux favoris`} aria-pressed={isFavorite} className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: isFavorite ? "#FFF3D6" : bg }}>
              <Star size={15} color={isFavorite ? gold : muted} fill={isFavorite ? gold : "none"} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2">
          {isMatch && onUnmatch && (
            <button onClick={() => onUnmatch(profile)} className="text-[11px] font-semibold flex items-center gap-1 focus-visible:outline focus-visible:outline-2" style={{ color: coral }}>
              <HeartCrack size={12} /> Supprimer le match
            </button>
          )}
          {onReport && (
            <button onClick={() => onReport(profile)} className="text-[11px] font-semibold flex items-center gap-1 focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
              <Flag size={12} /> Signaler
            </button>
          )}
          {onBlock && (
            <button onClick={() => onBlock(profile)} className="text-[11px] font-semibold flex items-center gap-1 focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
              <Ban size={12} /> Bloquer
            </button>
          )}
          {onHide && (
            <button onClick={() => onHide(profile)} className="text-[11px] font-semibold flex items-center gap-1 focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
              <EyeOff size={12} /> Masquer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
