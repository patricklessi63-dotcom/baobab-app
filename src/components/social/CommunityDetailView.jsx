import React, { useState } from "react";
import { ArrowLeft, MapPin, Users, Share2, Flag, Lock, Mail, Shield } from "lucide-react";
import CommunityPostCard from "./CommunityPostCard";
import CommunityPostComposer from "./CommunityPostComposer";
import CommunityMemberRow from "./CommunityMemberRow";
import CommunityAdminPanel from "./CommunityAdminPanel";
import EmptyState from "../home/EmptyState";
import Skeleton from "../Skeleton";
import { categoryIcon, categoryLabel } from "../../lib/communities/communityConfig";
import { isStaff, canPost } from "../../lib/communities/permissions";
import { primary, green, coral, gold, muted, bg, card, body, primaryRgb } from "./theme";

const SUB_TABS = [["about", "À propos"], ["posts", "Publications"], ["members", "Membres"]];

export default function CommunityDetailView({
  community,
  memberCount,
  viewerRole,
  viewerPending,
  currentUser,
  onBack,
  onJoin,
  onLeave,
  onShare,
  onReportCommunity,
  posts,
  postsLoading,
  postDraft,
  setPostDraft,
  onSubmitPost,
  postSubmitting,
  likedPostIds,
  postLikeCounts,
  onToggleLike,
  commentsByPost,
  onLoadComments,
  onSubmitComment,
  onReportPost,
  onDeletePost,
  members,
  membersLoading,
  onViewMemberProfile,
  onSetMemberRole,
  onRemoveMember,
  joinRequests,
  reports,
  onAcceptRequest,
  onRejectRequest,
  onResolveReport,
  onDismissReport,
}) {
  const [subTab, setSubTab] = useState("posts");
  const staff = isStaff(viewerRole);
  const isPrivate = community.visibility === "private";
  const isInviteOnly = community.visibility === "invite_only";
  const canSeeContent = community.visibility === "public" || Boolean(viewerRole);

  const tabs = staff ? [...SUB_TABS, ["admin", "Gestion"]] : SUB_TABS;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold mb-4 focus-visible:outline focus-visible:outline-2" style={{ color: primary }}>
        <ArrowLeft size={16} /> Communautés
      </button>

      <div className={`${card} overflow-hidden`}>
        <div className="h-36 relative" style={{ background: community.cover_url ? `url(${community.cover_url}) center/cover` : `linear-gradient(150deg,${gold},${coral})` }} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black" style={{ color: primary }}>{community.name}</h1>
                {isPrivate && <Lock size={14} color={muted} aria-label="Communauté privée" />}
                {isInviteOnly && <Mail size={14} color={muted} aria-label="Sur invitation" />}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: muted }}>
                <span>{categoryIcon(community.category)} {categoryLabel(community.category)}</span>
                {community.city && <span className="flex items-center gap-1"><MapPin size={11} /> {community.city}</span>}
                <span className="flex items-center gap-1"><Users size={11} /> {memberCount.toLocaleString("fr-CA")} membre{memberCount > 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => onShare(community)} aria-label="Partager" className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: bg }}>
                <Share2 size={15} color={primary} />
              </button>
              <button onClick={() => onReportCommunity(community)} aria-label="Signaler cette communauté" className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: bg }}>
                <Flag size={14} color={muted} />
              </button>
            </div>
          </div>

          {community.description && <p className="text-sm mt-3" style={{ color: body }}>{community.description}</p>}

          <div className="mt-4">
            {viewerRole ? (
              viewerRole !== "owner" && (
                <button onClick={() => onLeave(community)} className="px-4 py-2.5 rounded-full text-sm font-bold" style={{ border: `1px solid rgba(${primaryRgb},.15)`, color: primary }}>
                  Quitter la communauté
                </button>
              )
            ) : isInviteOnly ? (
              <span className="text-sm font-semibold" style={{ color: muted }}>Cette communauté est accessible uniquement sur invitation.</span>
            ) : viewerPending ? (
              <span className="px-4 py-2.5 rounded-full text-sm font-bold inline-block" style={{ background: bg, color: muted }}>Demande envoyée</span>
            ) : (
              <button onClick={() => onJoin(community)} className="px-5 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: coral }}>
                {isPrivate ? "Demander à rejoindre" : "Rejoindre"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 mt-5 overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className="px-4 py-2 rounded-full text-xs font-bold flex-shrink-0"
            style={{ background: subTab === key ? primary : bg, color: subTab === key ? "#fff" : muted }}
          >
            {key === "admin" && <Shield size={12} className="inline mr-1 -mt-0.5" />}
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {subTab === "about" && (
          <div className={`${card} p-5 text-sm`} style={{ color: body }}>
            <p>{community.description || "Aucune description pour l'instant."}</p>
            {community.creatorName && <p className="mt-3 text-xs" style={{ color: muted }}>Créée par {community.creatorName}</p>}
          </div>
        )}

        {subTab === "posts" && (
          !canSeeContent ? (
            <div className={`${card} p-5`}>
              <EmptyState icon={Lock} title="Communauté privée" subtitle="Rejoins cette communauté pour voir ses publications." />
            </div>
          ) : (
            <div className={`${card} p-5`}>
              {canPost(viewerRole) && (
                <div className="pb-4 mb-1" style={{ borderBottom: `1px solid rgba(${primaryRgb},.06)` }}>
                  <CommunityPostComposer currentUser={currentUser} draft={postDraft} setDraft={setPostDraft} onSubmit={onSubmitPost} submitting={postSubmitting} />
                </div>
              )}
              {postsLoading ? (
                <Skeleton rows={3} height={50} />
              ) : posts.length === 0 ? (
                <EmptyState title="Aucune publication pour l'instant." subtitle="Sois le/la premier·ère à publier ici." />
              ) : (
                posts.map((post) => (
                  <CommunityPostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser?.id}
                    liked={likedPostIds.has(post.id)}
                    likeCount={postLikeCounts[post.id] || 0}
                    comments={commentsByPost[post.id]?.items || []}
                    commentsLoaded={Boolean(commentsByPost[post.id])}
                    onToggleLike={onToggleLike}
                    onLoadComments={onLoadComments}
                    onSubmitComment={onSubmitComment}
                    onReport={onReportPost}
                    onDelete={onDeletePost}
                    canDelete={post.author_id === currentUser?.id || isStaff(viewerRole) || viewerRole === "moderator"}
                  />
                ))
              )}
            </div>
          )
        )}

        {subTab === "members" && (
          <div className={`${card} p-5`}>
            {membersLoading ? (
              <Skeleton rows={4} height={40} />
            ) : members.length === 0 ? (
              <EmptyState title="Aucun membre pour l'instant." />
            ) : (
              members.map((m) => (
                <CommunityMemberRow
                  key={m.id}
                  member={m}
                  viewerRole={viewerRole}
                  currentUserId={currentUser?.id}
                  onViewProfile={onViewMemberProfile}
                  onSetRole={onSetMemberRole}
                  onRemove={onRemoveMember}
                />
              ))
            )}
          </div>
        )}

        {subTab === "admin" && staff && (
          <CommunityAdminPanel
            joinRequests={joinRequests}
            reports={reports}
            onAccept={onAcceptRequest}
            onReject={onRejectRequest}
            onResolveReport={onResolveReport}
            onDismissReport={onDismissReport}
          />
        )}
      </div>
    </div>
  );
}
