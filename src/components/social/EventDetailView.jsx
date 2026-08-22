import React, { useState } from "react";
import { ArrowLeft, MapPin, Users, Share2, Flag, Lock, Users2, Clock, Calendar, UserPlus, Pencil, Ban, Shield, Trash2 } from "lucide-react";
import EventParticipantsList from "./EventParticipantsList";
import EventCommentsSection from "./EventCommentsSection";
import EventPhotoGallery from "./EventPhotoGallery";
import EmptyState from "../home/EmptyState";
import Skeleton from "../Skeleton";
import { categoryIcon, categoryLabel, reportCategoryLabel, timezoneLabel } from "../../lib/events/eventConfig";
import { isEventStaff } from "../../lib/events/permissions";
import { downloadIcs, googleCalendarUrl } from "../../lib/events/calendarExport";
import { formatEventWhen } from "../../utils/format";
import { primary, green, coral, gold, muted, bg, card, body, primaryRgb, navy } from "./theme";
import { useImageLightbox } from "../../lib/ImageLightboxContext";

const SUB_TABS = [["about", "À propos"], ["discussion", "Discussion"], ["participants", "Participants"], ["photos", "Photos"]];

function durationLabel(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

export default function EventDetailView({
  event,
  viewerRole,
  viewerStatus,
  participantCount,
  mutualCount,
  currentUser,
  onBack,
  onJoin,
  onLeave,
  onShareFeed,
  onShareMessage,
  onOpenInvite,
  onReportEvent,
  onEdit,
  onCancel,
  onDeleteEvent,
  communityName,
  onOpenCommunity,
  participants,
  participantsLoading,
  onViewParticipantProfile,
  comments,
  commentsLoading,
  commentDraft,
  setCommentDraft,
  onSubmitComment,
  onDeleteComment,
  photos,
  photosLoading,
  onUploadPhoto,
  onDeletePhoto,
  reports,
  onResolveReport,
  onDismissReport,
  blockedIds,
}) {
  const [subTab, setSubTab] = useState("about");
  const [shareOpen, setShareOpen] = useState(false);
  const staff = isEventStaff(viewerRole);
  const { openLightbox } = useImageLightbox();
  const canceled = Boolean(event.canceled_at);
  const isPrivate = event.visibility === "private";
  const isCommunityOnly = event.visibility === "community";
  const full = event.max_participants != null && participantCount >= event.max_participants;
  const tabs = staff ? [...SUB_TABS, ["admin", "Gestion"]] : SUB_TABS;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold mb-4 focus-visible:outline focus-visible:outline-2" style={{ color: primary }}>
        <ArrowLeft size={16} /> Événements
      </button>

      <div className={`${card} overflow-hidden`}>
        <div
          className="h-40 relative"
          style={{ background: event.cover_url ? `url(${event.cover_url}) center/cover` : `linear-gradient(150deg,${gold},${coral})`, cursor: event.cover_url ? "zoom-in" : undefined }}
          onClick={() => event.cover_url && openLightbox([{ url: event.cover_url, alt: event.title }])}
          role={event.cover_url ? "button" : undefined}
          aria-label={event.cover_url ? "Agrandir la couverture de l'événement" : undefined}
        >
          {canceled && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: `rgba(${primaryRgb},.55)` }}>
              <span className="text-white font-black text-sm px-4 py-2 rounded-full" style={{ background: coral }}>❌ Événement annulé</span>
            </div>
          )}
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black" style={{ color: primary }}>{event.title}</h1>
                {isPrivate && <Lock size={14} color={muted} aria-label="Événement privé" />}
                {isCommunityOnly && <Users2 size={14} color={muted} aria-label="Événement de communauté" />}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: muted }}>
                <span>{categoryIcon(event.category)} {categoryLabel(event.category)}</span>
                <span className="flex items-center gap-1"><Calendar size={11} /> {formatEventWhen(event.event_date, event.timezone)}{event.timezone ? ` (${timezoneLabel(event.timezone)})` : ""}</span>
                {event.duration_minutes && <span className="flex items-center gap-1"><Clock size={11} /> {durationLabel(event.duration_minutes)}</span>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{ color: muted }}>
                {event.city && <span className="flex items-center gap-1"><MapPin size={11} /> {event.location ? `${event.location}, ${event.city}` : event.city}</span>}
                <span className="flex items-center gap-1"><Users size={11} /> {participantCount.toLocaleString("fr-CA")} participant{participantCount > 1 ? "s" : ""}{event.max_participants ? ` / ${event.max_participants}` : ""}</span>
              </div>
              {communityName && (
                <button onClick={onOpenCommunity} className="text-xs font-bold mt-2" style={{ color: coral }}>
                  🌍 Organisé par {communityName} →
                </button>
              )}
              {mutualCount > 0 && (
                <p className="text-xs mt-1.5" style={{ color: muted }}>
                  {mutualCount} personne{mutualCount > 1 ? "s" : ""} que tu connais participe{mutualCount > 1 ? "nt" : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {staff && (
                <button onClick={() => onEdit(event)} aria-label="Modifier l'événement" className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: bg }}>
                  <Pencil size={14} color={primary} />
                </button>
              )}
              <div className="relative">
                <button onClick={() => setShareOpen((v) => !v)} aria-label="Partager" aria-expanded={shareOpen} className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: bg }}>
                  <Share2 size={15} color={primary} />
                </button>
                {shareOpen && (
                  <div className="absolute right-0 top-11 w-56 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-1.5 z-20">
                    <button onClick={() => { setShareOpen(false); onShareMessage(event); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)]">💬 Dans une conversation</button>
                    {!isPrivate && !isCommunityOnly && (
                      <button onClick={() => { setShareOpen(false); onShareFeed(event); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)]">📰 Dans le fil Baobab</button>
                    )}
                    <button onClick={() => { setShareOpen(false); downloadIcs(event); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)]">📅 Télécharger (.ics)</button>
                    <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" onClick={() => setShareOpen(false)} className="block px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)]">🗓️ Ajouter à Google Calendar</a>
                  </div>
                )}
              </div>
              {(isPrivate || isCommunityOnly) && (
                <button onClick={() => onOpenInvite(event)} aria-label="Inviter" className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: bg }}>
                  <UserPlus size={15} color={primary} />
                </button>
              )}
              <button onClick={() => onReportEvent(event)} aria-label="Signaler cet événement" className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: bg }}>
                <Flag size={14} color={muted} />
              </button>
            </div>
          </div>

          {event.description && <p className="text-sm mt-3 whitespace-pre-wrap" style={{ color: body }}>{event.description}</p>}

          {!canceled && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {viewerStatus === "going" ? (
                <button onClick={() => onLeave(event)} className="px-4 py-2.5 rounded-full text-sm font-bold" style={{ background: "#EEF8F4", color: green }}>
                  Tu participes ✓ — Ne plus participer
                </button>
              ) : viewerStatus === "waitlisted" ? (
                <button onClick={() => onLeave(event)} className="px-4 py-2.5 rounded-full text-sm font-bold" style={{ background: "#FFF3D6", color: gold }}>
                  Sur liste d'attente — Quitter
                </button>
              ) : full ? (
                <button onClick={() => onJoin(event)} className="px-5 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: coral }}>
                  Rejoindre la liste d'attente
                </button>
              ) : (
                <button onClick={() => onJoin(event)} className="px-5 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: coral }}>
                  🎟️ Participer
                </button>
              )}
              {staff && !canceled && (
                <button onClick={() => onCancel(event)} className="px-4 py-2.5 rounded-full text-sm font-bold flex items-center gap-1.5" style={{ border: "1px solid rgba(225,107,93,.3)", color: coral }}>
                  <Ban size={14} /> Annuler l'événement
                </button>
              )}
              {onDeleteEvent && event.created_by === currentUser?.id && (
                <button
                  onClick={() => window.confirm(`Supprimer définitivement "${event.title}" ? Participants, discussions et photos seront aussi supprimés. Cette action est irréversible.`) && onDeleteEvent(event)}
                  className="px-4 py-2.5 rounded-full text-sm font-bold flex items-center gap-1.5"
                  style={{ border: "1px solid rgba(225,107,93,.3)", color: coral }}
                >
                  <Trash2 size={14} /> Supprimer l'événement
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 mt-5 overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className="px-4 py-2 rounded-full text-xs font-bold flex-shrink-0"
            style={{ background: subTab === key ? navy : bg, color: subTab === key ? "#fff" : muted }}
          >
            {key === "admin" && <Shield size={12} className="inline mr-1 -mt-0.5" />}
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {subTab === "about" && (
          <div className={`${card} p-5 text-sm`} style={{ color: body }}>
            <p>{event.description || "Aucune description pour l'instant."}</p>
            {event.organizerName && <p className="mt-3 text-xs" style={{ color: muted }}>Organisé par {event.organizerName}</p>}
          </div>
        )}

        {subTab === "discussion" && (
          <div className={`${card} p-5`}>
            <EventCommentsSection
              comments={comments}
              loading={commentsLoading}
              canPost={Boolean(viewerStatus) && viewerStatus !== "not_going"}
              draft={commentDraft}
              setDraft={setCommentDraft}
              currentUserId={currentUser?.id}
              onSubmit={onSubmitComment}
              onDelete={onDeleteComment}
              canModerate={staff}
            />
          </div>
        )}

        {subTab === "participants" && (
          <div className={`${card} p-5`}>
            {participantsLoading ? (
              <Skeleton rows={4} height={40} />
            ) : (
              <EventParticipantsList
                participants={participants}
                blockedIds={blockedIds}
                onViewProfile={onViewParticipantProfile}
              />
            )}
          </div>
        )}

        {subTab === "photos" && (
          <div className={`${card} p-5`}>
            <EventPhotoGallery
              photos={photos}
              loading={photosLoading}
              canUpload={Boolean(viewerStatus) && viewerStatus !== "not_going"}
              currentUserId={currentUser?.id}
              canModerate={staff}
              onUpload={onUploadPhoto}
              onDelete={onDeletePhoto}
            />
          </div>
        )}

        {subTab === "admin" && staff && (
          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <b className="text-sm" style={{ color: primary }}>Signalements</b>
              {reports.length > 0 && (
                <span className="text-[10px] font-black text-white rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center" style={{ background: coral }}>{reports.length}</span>
              )}
            </div>
            {reports.length === 0 ? (
              <EmptyState icon={Flag} title="Aucun signalement ouvert." />
            ) : (
              <div className="flex flex-col gap-2">
                {reports.map((rep) => (
                  <div key={rep.id} className="p-3 rounded-xl" style={{ background: bg }}>
                    <div className="text-sm font-semibold" style={{ color: primary }}>{reportCategoryLabel(rep.category)}</div>
                    {rep.reason && <p className="text-xs mt-1" style={{ color: muted }}>{rep.reason}</p>}
                    <div className="flex gap-2 mt-2.5">
                      <button onClick={() => onDismissReport(rep)} className="flex-1 text-xs font-bold py-2 rounded-full" style={{ border: `1px solid rgba(${primaryRgb},.15)`, color: primary }}>Ignorer</button>
                      <button onClick={() => onResolveReport(rep)} className="flex-1 text-xs font-bold py-2 rounded-full text-white" style={{ background: coral }}>Traiter</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
