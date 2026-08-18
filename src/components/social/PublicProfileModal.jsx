import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, Heart, MessageCircle, UserPlus, UserCheck, Star, Flag, Ban } from "lucide-react";
import Avatar from "../Avatar";
import VerifiedBadge from "../VerifiedBadge";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, green, coral, gold, bg, muted, card } from "./theme";

// Allow-list explicite des champs affichés — jamais de spread {...profile},
// jamais d'email/user_id/id bruts rendus.
function Row({ icon, label, children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 py-2">
      <span className="text-base leading-none mt-0.5" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: muted }}>{label}</div>
        <div className="text-sm mt-0.5" style={{ color: "#20243A" }}>{children}</div>
      </div>
    </div>
  );
}

export default function PublicProfileModal({
  profile,
  photos = [],
  onClose,
  isMatch = false,
  isFavorite = false,
  isFollowing = false,
  onLike,
  onMessage,
  onToggleFavorite,
  onToggleFollow,
  onReport,
  onBlock,
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  useEscapeKey(Boolean(profile), onClose);
  if (!profile) return null;

  const gallery = photos.length > 0 ? photos.map((p) => p.url) : profile.avatar_url ? [profile.avatar_url] : [];
  const next = () => setPhotoIdx((i) => (i + 1) % gallery.length);
  const prev = () => setPhotoIdx((i) => (i - 1 + gallery.length) % gallery.length);

  const languagesDetail = Array.isArray(profile.languages_detail) ? profile.languages_detail : [];
  const showCity = profile.show_city !== false;
  const showCountry = profile.show_country !== false;
  const showOccupation = profile.show_occupation !== false;
  const showStudies = profile.show_studies !== false;
  const showCanadaJourney = profile.show_canada_journey !== false;
  const showLifeProject = profile.show_life_project !== false;
  const showInterests = profile.show_interests !== false;

  const lifeProjectParts = [profile.wants_children, profile.family_importance, profile.career_goal, profile.geographic_openness].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-5"
      style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(5px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Profil de ${profile.name}`}
    >
      <div
        className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {gallery.length > 0 ? (
            <div className="relative h-72 bg-black">
              <img src={gallery[photoIdx]} alt={profile.name} className="w-full h-full object-cover" />
              {gallery.length > 1 && (
                <>
                  <button onClick={prev} aria-label="Photo précédente" className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center focus-visible:outline focus-visible:outline-2">
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={next} aria-label="Photo suivante" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center focus-visible:outline focus-visible:outline-2">
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                    {gallery.map((_, i) => (
                      <span key={i} className="h-1.5 rounded-full" style={{ width: i === photoIdx ? 16 : 6, background: i === photoIdx ? "#fff" : "rgba(255,255,255,.5)" }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="h-40 flex items-center justify-center"
              style={profile.cover_url ? { background: `url(${profile.cover_url}) center/cover` } : { background: bg }}
            >
              <Avatar name={profile.name} url={profile.avatar_url} size={88} />
            </div>
          )}
          <button onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center focus-visible:outline focus-visible:outline-2">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black" style={{ color: primary }}>{profile.name}{profile.age ? `, ${profile.age}` : ""}</h2>
            <VerifiedBadge emailVerified={profile.email_verified} phoneVerified={profile.phone_verified} />
          </div>

          {(showCity && profile.city) && (
            <p className="text-sm mt-0.5" style={{ color: muted }}>
              📍 {profile.city}{showCountry && profile.country ? ` · ${profile.country}` : ""}
            </p>
          )}

          <div className="mt-2">
            {showCanadaJourney && (profile.arrived_since || profile.immigration_status) && (
              <Row icon="🇨🇦" label="Parcours Canada">
                {[profile.arrived_since, profile.immigration_status, profile.arrival_city].filter(Boolean).join(" · ")}
              </Row>
            )}
            {profile.looking_for && (
              <Row icon="❤️" label="Intentions">
                {[profile.looking_for, profile.relationship_values].filter(Boolean).join(" · ")}
              </Row>
            )}
            {languagesDetail.length > 0 && (
              <Row icon="🗣️" label="Langues">
                {languagesDetail.map((l) => `${l.language} (${l.level})`).join(", ")}
              </Row>
            )}
            {showOccupation && profile.occupation && <Row icon="💼" label="Profession">{profile.occupation}</Row>}
            {showStudies && profile.education_level && <Row icon="🎓" label="Études">{profile.education_level}</Row>}
            {showInterests && profile.interests && <Row icon="✨" label="Centres d'intérêt">{profile.interests}</Row>}
            {showLifeProject && lifeProjectParts.length > 0 && (
              <Row icon="🌱" label="Projet de vie">{lifeProjectParts.join(" · ")}</Row>
            )}
            {profile.bio && <Row icon="📝" label="À propos">{profile.bio}</Row>}
          </div>

          <div className="flex items-center gap-2 mt-5 flex-wrap">
            {onLike && (
              <button onClick={() => onLike(profile)} className="flex-1 min-w-[100px] rounded-full py-2.5 text-sm font-bold text-white flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2" style={{ background: coral }}>
                <Heart size={15} /> J'aime
              </button>
            )}
            {isMatch && onMessage && (
              <button onClick={() => onMessage(profile)} className="flex-1 min-w-[100px] rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2" style={{ background: bg, color: primary }}>
                <MessageCircle size={15} /> Message
              </button>
            )}
            {onToggleFollow && (
              <button
                onClick={() => onToggleFollow(profile)}
                aria-pressed={isFollowing}
                className="flex-1 min-w-[100px] rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2"
                style={{ background: isFollowing ? bg : primary, color: isFollowing ? primary : "#fff" }}
              >
                {isFollowing ? <UserCheck size={15} /> : <UserPlus size={15} />} {isFollowing ? "Abonné(e)" : "Suivre"}
              </button>
            )}
            {onToggleFavorite && (
              <button onClick={() => onToggleFavorite(profile)} aria-pressed={isFavorite} aria-label={isFavorite ? `Retirer ${profile.name} des favoris` : `Ajouter ${profile.name} aux favoris`} className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: isFavorite ? "#FFF3D6" : bg }}>
                <Star size={16} color={isFavorite ? gold : muted} fill={isFavorite ? gold : "none"} />
              </button>
            )}
            {onReport && (
              <button onClick={() => onReport(profile)} aria-label="Signaler" className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: bg }}>
                <Flag size={15} color={muted} />
              </button>
            )}
            {onBlock && (
              <button onClick={() => onBlock(profile)} aria-label="Bloquer" className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: bg }}>
                <Ban size={15} color={muted} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
