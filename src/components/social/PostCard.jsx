import React, { useState } from "react";
import { Heart, MessageCircle, Flag, Trash2, Pencil, Check, X } from "lucide-react";
import Avatar from "../Avatar";
import ClickableImage from "../ClickableImage";
import PostMediaGrid from "./PostMediaGrid";
import { useImageLightbox } from "../../lib/ImageLightboxContext";
import { formatMessageTime, formatDayLabel } from "../../utils/format";
import { primary, coral, muted, bg, primaryRgb } from "./theme";

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
  onLoadComments,
  onSubmitComment,
  onReport,
  onDelete,
  onEdit,
  canModerate = false,
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.body);
  const { openLightbox } = useImageLightbox();
  const author = post.profiles || {};
  const isMine = post.author_id === currentUserId;
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

  const submitComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    onSubmitComment(post.id, text);
    setCommentDraft("");
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
        <Avatar name={author.name} url={author.avatar_url} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold" style={{ color: primary }}>{author.name || "Membre"}</span>
            <span className="text-[11px]" style={{ color: muted }}>· {formatDayLabel(post.created_at)} {formatMessageTime(post.created_at)}</span>
            {post.updated_at && <span className="text-[11px]" style={{ color: muted }}>(modifié)</span>}
          </div>

          {editing ? (
            <div className="mt-1.5">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value.slice(0, MAX_LENGTH))}
                rows={2}
                className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none"
                style={{ background: bg }}
              />
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={confirmEdit} disabled={!editDraft.trim()} className="flex items-center gap-1 text-xs font-bold disabled:opacity-40" style={{ color: coral }}>
                  <Check size={13} /> Enregistrer
                </button>
                <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs font-semibold" style={{ color: muted }}>
                  <X size={13} /> Annuler
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm mt-1 whitespace-pre-wrap break-words">{post.body}</p>
          )}

          {!editing && mediaList.length === 1 && (
            mediaList[0].kind === "video" ? (
              <video src={mediaList[0].url} controls preload="metadata" className="w-full max-h-96 rounded-xl mt-2.5 object-cover" />
            ) : (
              <ClickableImage src={mediaList[0].url} alt="" gallery={[{ url: mediaList[0].url, alt: "" }]} className="w-full max-h-96 rounded-xl mt-2.5 object-cover" />
            )
          )}
          {!editing && mediaList.length > 1 && (
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
              <button onClick={() => onToggleLike(post)} aria-label={liked ? "Retirer le like" : "Aimer"} aria-pressed={liked} className="flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: liked ? coral : muted }}>
                <Heart size={15} fill={liked ? coral : "none"} /> {likeCount > 0 ? likeCount : ""}
              </button>
              <button onClick={toggleComments} className="flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                <MessageCircle size={15} /> {(commentsLoaded ? comments.length : commentCount) > 0 ? (commentsLoaded ? comments.length : commentCount) : "Commenter"}
              </button>
              {!isMine && (
                <button onClick={() => onReport(post)} aria-label="Signaler la publication" className="flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                  <Flag size={13} />
                </button>
              )}
              {isMine && (
                <button onClick={startEdit} aria-label="Modifier la publication" className="flex items-center gap-1.5 text-xs font-semibold ml-auto focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
                  <Pencil size={13} />
                </button>
              )}
              {(isMine || canModerate) && (
                <button onClick={() => onDelete(post)} aria-label="Supprimer la publication" className={`flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 ${isMine ? "" : "ml-auto"}`} style={{ color: coral }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          {commentsOpen && (
            <div className="mt-3 flex flex-col gap-2.5">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={26} />
                  <div className="rounded-xl px-3 py-2 flex-1" style={{ background: bg }}>
                    <span className="text-xs font-bold" style={{ color: primary }}>{c.profiles?.name || "Membre"}</span>
                    <p className="text-xs mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-1">
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value.slice(0, 1000))}
                  onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
                  placeholder="Écrire un commentaire..."
                  aria-label="Écrire un commentaire"
                  className="flex-1 text-xs rounded-full px-3.5 py-2 outline-none"
                  style={{ background: bg }}
                />
                <button onClick={submitComment} disabled={!commentDraft.trim()} className="text-xs font-bold px-3 py-2 rounded-full disabled:opacity-40" style={{ color: coral }}>
                  Envoyer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
