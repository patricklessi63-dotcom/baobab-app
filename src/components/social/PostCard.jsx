import React, { useRef, useState } from "react";
import { Heart, MessageCircle, Flag, Ban, Trash2, Pencil, Check, X, ImageOff, SmilePlus } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import ClickableImage from "../ClickableImage";
import PostMediaGrid from "./PostMediaGrid";
import PostComments from "./PostComments";
import MentionText from "./MentionText";
import ConfirmModal from "./ConfirmModal";
import { useImageLightbox } from "../../lib/ImageLightboxContext";
import { formatMessageTime, formatDayLabel } from "../../utils/format";
import { primary, coral, coralText, muted, bg, primaryRgb } from "./theme";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusReturn } from "../../hooks/useFocusReturn";
import { HEART, POST_REACTIONS, POST_REACTION_LABEL, topReactions } from "../../lib/postReactions";

const MAX_LENGTH = 4000;

// Calqué sur CommunityPostCard.jsx (mêmes props de base), étendu avec le
// rendu média (posts.media_url/media_kind) et l'édition (onEdit) — les deux
// absents du modèle communauté (texte seul, pas d'UPDATE côté community_posts).
export default function PostCard({
  post,
  currentUserId,
  liked,
  likeCount,
  commentCount = 0,
  comments = [],
  commentsLoaded,
  onToggleLike,
  myReaction = null,
  reactionCounts = {},
  onReact,
  onLoadComments,
  onSubmitComment,
  onReport,
  onReportComment,
  onReportMedia,
  mediaHidden = false,
  onDelete,
  onEdit,
  canModerate = false,
  onViewProfile,
  onSearchMentions,
  commentLikeCounts = null,
  myCommentLikes,
  onToggleCommentLike,
  onBlockAuthor,
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Sélecteur des six réactions (SQL-32) : ferme au clic extérieur et à Échap, comme les autres menus.
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const reactionsRef = useRef(null);
  useClickOutside(reactionsRef, reactionsOpen, () => setReactionsOpen(false));
  useEscapeKey(reactionsOpen, () => setReactionsOpen(false));
  useFocusReturn(reactionsOpen);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.body);
  // Suppression en attente de confirmation — remplace l'ancien
  // window.confirm(), voir ConfirmModal.jsx.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { openLightbox } = useImageLightbox();
  const author = post.profiles || {};
  const isMine = post.author_id === currentUserId;
  const canOpenAuthor = Boolean(onViewProfile) && !isMine && Boolean(post.author_id);
  // post_media (galerie multi-médias) prioritaire ; retombe sur
  // media_url/media_kind pour les publications créées avant la refonte du
  // composeur (item 30 : ne jamais casser les données déjà en base).
  const mediaList = (post.post_media && post.post_media.length > 0)
    ? post.post_media.map((m) => ({ url: m.url, kind: m.kind }))
    : (post.media_url ? [{ url: post.media_url, kind: post.media_kind }] : []);

  const toggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && !commentsLoaded) onLoadComments(post.id);
  };

  const startEdit = () => { setEditDraft(post.body); setEditing(true); };
  const confirmEdit = () => {
    const text = editDraft.trim();
    if (!text) return;
    onEdit(post, text);
    setEditing(false);
  };

  return (
    <div className="py-4" style={{ borderBottom: `1px solid rgba(${primaryRgb},.06)` }}>
      <div className="flex items-start gap-3">
        {/* Avatar et nom ouvrent la fiche de l'auteur (Signaler / Bloquer en 2 touches) —
            Apple 1.2 / Google Play UGC. Pas pour ses propres publications. */}
        {canOpenAuthor ? (
          <button type="button" onClick={() => onViewProfile(post.author_id)} aria-label={`Voir le profil de ${author.name || "cette personne"}`} className="bb-hit shrink-0 rounded-full focus-visible:outline focus-visible:outline-2">
            <Avatar name={author.name} url={author.avatar_url} size={38} />
          </button>
        ) : (
          <Avatar name={author.name} url={author.avatar_url} size={38} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {canOpenAuthor ? (
              <button type="button" onClick={() => onViewProfile(post.author_id)} className="text-sm font-bold text-left focus-visible:outline focus-visible:outline-2" style={{ color: primary }}>{author.name || "Membre"}</button>
            ) : (
              <span className="text-sm font-bold" style={{ color: primary }}>{author.name || "Membre"}</span>
            )}
            {/* Parité de badges (bug corrigé à l'audit, même famille que
                PublicProfileModal/AdmirersModal) : champs désormais chargés
                dans loadPosts() (PostsFeed.jsx). */}
            <StatusBadge isFounder={author.is_founder} isPremium={author.is_premium} emailVerified={author.email_verified} phoneVerified={author.phone_verified} size={12} />
            <span className="text-[11px]" style={{ color: muted }}>· {formatDayLabel(post.created_at)} {formatMessageTime(post.created_at)}</span>
            {post.updated_at && <span className="text-[11px]" style={{ color: muted }}>(modifié)</span>}
          </div>

          {editing ? (
            <div className="mt-1.5">
              <textarea
                dir="auto"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value.slice(0, MAX_LENGTH))}
                rows={2}
                className="w-full text-sm rounded-xl px-3 py-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-accent)] resize-none"
                style={{ background: bg }}
              />
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={confirmEdit} disabled={!editDraft.trim()} className="bb-hit flex items-center gap-1 text-xs font-bold disabled:opacity-40" style={{ color: coralText }}>
                  <Check size={13} /> Enregistrer
                </button>
                <button onClick={() => setEditing(false)} className="bb-hit flex items-center gap-1 text-xs font-semibold" style={{ color: muted }}>
                  <X size={13} /> Annuler
                </button>
              </div>
            </div>
          ) : (
            <p dir="auto" className="text-sm mt-1 whitespace-pre-wrap break-words"><MentionText body={post.body} mentions={post.mentions} onOpenProfile={onViewProfile} /></p>
          )}

          {!editing && mediaHidden && mediaList.length > 0 && (
            <p role="status" className="text-xs mt-2.5 p-3 rounded-xl" style={{ background: "var(--bb-surface-2)", color: muted }}>Image masquée en attendant l'examen d'un modérateur.</p>
          )}
          {!editing && !mediaHidden && mediaList.length === 1 && (
            mediaList[0].kind === "video" ? (
              <video src={mediaList[0].url} controls playsInline preload="metadata" className="w-full max-h-96 rounded-xl mt-2.5 object-cover" />
            ) : (
              <ClickableImage src={mediaList[0].url} alt="" gallery={[{ url: mediaList[0].url, alt: "" }]} className="w-full max-h-96 rounded-xl mt-2.5 object-cover" />
            )
          )}
          {!editing && !mediaHidden && mediaList.length > 1 && (
            <PostMediaGrid
              items={mediaList}
              className="mt-2.5 rounded-xl overflow-hidden"
              onItemClick={(item, i) => {
                if (item.kind === "video") return;
                const photos = mediaList.filter((m) => m.kind !== "video").map((m) => ({ url: m.url, alt: "" }));
                const photoIndex = mediaList.slice(0, i + 1).filter((m) => m.kind !== "video").length - 1;
                openLightbox(photos, photoIndex);
              }}
            />
          )}

          {!editing && (
            <div className="flex items-center gap-4 mt-2.5">
              <div ref={reactionsRef} className="flex items-center gap-1" style={{ position: "relative" }}>
                <button
                  onClick={() => onToggleLike(post)}
                  aria-label={myReaction && myReaction !== HEART ? `Retirer ma réaction ${myReaction}` : liked ? "Retirer le like" : "Aimer"}
                  aria-pressed={liked}
                  className="bb-hit flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2"
                  style={{ color: liked ? coralText : muted }}
                >
                  {myReaction && myReaction !== HEART
                    ? <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>{myReaction}</span>
                    : <Heart size={15} fill={liked ? coral : "none"} />}
                  {onReact && likeCount > 0 && <span aria-hidden="true" style={{ fontSize: 12, letterSpacing: 1 }}>{topReactions(reactionCounts).join("")}</span>}
                  {likeCount > 0 ? likeCount : ""}
                </button>
                {onReact && (
                  <button
                    onClick={() => setReactionsOpen((v) => !v)}
                    aria-label="Choisir une réaction"
                    aria-haspopup="menu"
                    aria-expanded={reactionsOpen}
                    className="bb-hit flex items-center text-xs font-semibold focus-visible:outline focus-visible:outline-2"
                    style={{ color: muted }}
                  >
                    <SmilePlus size={15} />
                  </button>
                )}
                {onReact && reactionsOpen && (
                  <div role="menu" className="flex items-center px-1 rounded-full bg-[var(--bb-surface)] shadow-xl" style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, border: `1px solid rgba(${primaryRgb},.08)`, zIndex: 5 }}>
                    {POST_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        role="menuitemradio"
                        aria-checked={myReaction === emoji}
                        onClick={() => { onReact(post, emoji); setReactionsOpen(false); }}
                        className="text-lg min-w-[40px] min-h-[44px] flex items-center justify-center hover:scale-125 motion-safe:transition-transform focus-visible:outline focus-visible:outline-2"
                        style={{ opacity: myReaction && myReaction !== emoji ? 0.55 : 1 }}
                        aria-label={`${POST_REACTION_LABEL[emoji]} ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={toggleComments} aria-label="Afficher les commentaires" className="bb-hit flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                <MessageCircle size={15} /> {(commentsLoaded ? comments.length : commentCount) > 0 ? (commentsLoaded ? comments.length : commentCount) : "Commenter"}
              </button>
              {!isMine && (
                <button onClick={() => onReport(post)} aria-label="Signaler la publication" className="bb-hit flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                  <Flag size={13} />
                </button>
              )}
              {!isMine && mediaList.length > 0 && onReportMedia && (
                <button onClick={() => onReportMedia({ kind: "post", id: post.id })} aria-label="Signaler l'image" className="bb-hit flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                  <ImageOff size={13} />
                </button>
              )}
              {!isMine && onBlockAuthor && (
                <button onClick={() => onBlockAuthor({ id: post.author_id, name: author.name || "cet auteur" })} aria-label="Bloquer l'auteur de la publication" className="bb-hit flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                  <Ban size={13} />
                </button>
              )}
              {isMine && (
                <button onClick={startEdit} aria-label="Modifier la publication" className="bb-hit flex items-center gap-1.5 text-xs font-semibold ml-auto focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                  <Pencil size={13} />
                </button>
              )}
              {(isMine || canModerate) && (
                // Suppression irréversible (publication + médias) — confirmation
                // requise avant l'appel, comme partout ailleurs dans l'app pour
                // une action destructrice (unmatch, quitter/supprimer une
                // communauté, supprimer un message pour tout le monde...). Ce
                // bouton appelait onDelete au premier tap, sans aucune
                // confirmation ni possibilité d'annuler un tap accidentel.
                <button
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Supprimer la publication"
                  className={`bb-hit flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 ${isMine ? "" : "ml-auto"}`}
                  style={{ color: coral }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          {commentsOpen && (
            <PostComments
              comments={comments}
              currentUserId={currentUserId}
              onSubmit={(text, opts) => (opts ? onSubmitComment(post.id, text, opts) : onSubmitComment(post.id, text))}
              onReportComment={onReportComment}
              onBlockAuthor={onBlockAuthor}
              onSearchMentions={onSearchMentions}
              likeCounts={commentLikeCounts}
              myLikes={myCommentLikes}
              onToggleLike={onToggleCommentLike}
              onOpenProfile={onViewProfile}
            />
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmingDelete}
        title="Supprimer cette publication ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => { onDelete(post); setConfirmingDelete(false); }}
      />
    </div>
  );
}
