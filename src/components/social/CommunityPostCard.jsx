import React, { useState } from "react";
import { MessageCircle, Flag, Trash2, X, Reply, Pencil, Check } from "lucide-react";
import Avatar from "../Avatar";
import { formatMessageTime, formatDayLabel } from "../../utils/format";
import { primary, coral, muted, bg, primaryRgb } from "./theme";

const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🎉"];

export default function CommunityPostCard({
  post,
  currentUserId,
  reactionCounts = {}, // { emoji: count }
  myReaction = null, // emoji or null
  commentCount = 0,
  comments = [],
  commentsLoaded,
  onReact = () => {},
  onLoadComments,
  onSubmitComment,
  onEditComment = () => {},
  onReport,
  onDelete,
  canDelete,
  onDeleteComment = () => {},
  canModerate = false,
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // comment being replied to
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const author = post.profiles || {};
  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

  const toggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && !commentsLoaded) onLoadComments(post.id);
  };

  const submitComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    onSubmitComment(post.id, text, replyingTo?.id || null);
    setCommentDraft("");
    setReplyingTo(null);
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditDraft(c.body);
  };

  const submitEdit = () => {
    const text = editDraft.trim();
    if (!text) return;
    onEditComment(post.id, editingId, text);
    setEditingId(null);
  };

  const commentById = (id) => comments.find((c) => c.id === id);

  return (
    <div className="py-4" style={{ borderBottom: `1px solid rgba(${primaryRgb},.06)` }}>
      <div className="flex items-start gap-3">
        <Avatar name={author.name} url={author.avatar_url} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold" style={{ color: primary }}>{author.name || "Membre"}</span>
            <span className="text-[11px]" style={{ color: muted }}>· {formatDayLabel(post.created_at)} {formatMessageTime(post.created_at)}</span>
          </div>
          {post.body && <p className="text-sm mt-1 whitespace-pre-wrap break-words">{post.body}</p>}

          {post.media_url && (
            <div className="mt-2 rounded-xl overflow-hidden" style={{ maxHeight: 360 }}>
              {post.media_kind === "video" ? (
                <video src={post.media_url} controls className="w-full max-h-[360px] object-cover" />
              ) : (
                <img src={post.media_url} alt="" className="w-full max-h-[360px] object-cover" />
              )}
            </div>
          )}

          <div className="flex items-center gap-4 mt-2.5" style={{ position: "relative" }}>
            <button
              onClick={() => setReactionsOpen((v) => !v)}
              aria-label={myReaction ? `Réaction : ${myReaction}` : "Réagir"}
              aria-pressed={Boolean(myReaction)}
              className="flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2"
              style={{ color: myReaction ? coral : muted }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{myReaction || "🤍"}</span> {totalReactions > 0 ? totalReactions : "Réagir"}
            </button>
            {reactionsOpen && (
              <div role="menu" className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-white shadow-xl" style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, border: `1px solid rgba(${primaryRgb},.08)`, zIndex: 5 }}>
                {QUICK_REACTIONS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => { onReact(post, emoji); setReactionsOpen(false); }} className="text-lg px-0.5 hover:scale-125 motion-safe:transition-transform" aria-label={`Réagir avec ${emoji}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <button onClick={toggleComments} className="flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
              <MessageCircle size={15} /> {(commentsLoaded ? comments.length : commentCount) > 0 ? (commentsLoaded ? comments.length : commentCount) : "Commenter"}
            </button>
            <button onClick={() => onReport(post)} className="flex items-center gap-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
              <Flag size={13} />
            </button>
            {canDelete && (
              <button onClick={() => onDelete(post)} aria-label="Supprimer la publication" className="flex items-center gap-1.5 text-xs font-semibold ml-auto focus-visible:outline focus-visible:outline-2" style={{ color: coral }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {commentsOpen && (
            <div className="mt-3 flex flex-col gap-2.5">
              {comments.map((c) => {
                const parent = c.reply_to_id ? commentById(c.reply_to_id) : null;
                const isEditing = editingId === c.id;
                return (
                  <div key={c.id} className="flex items-start gap-2">
                    <Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={26} />
                    <div className="rounded-xl px-3 py-2 flex-1" style={{ background: bg }}>
                      {parent && (
                        <div className="text-[10px] mb-0.5 truncate" style={{ color: muted }}>
                          ↳ en réponse à {parent.profiles?.name || "un commentaire"}
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold" style={{ color: primary }}>{c.profiles?.name || "Membre"}</span>
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 mt-1">
                              <input
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value.slice(0, 1000))}
                                onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); }}
                                aria-label="Modifier le commentaire"
                                className="flex-1 text-xs rounded-full px-3 py-1.5 outline-none"
                                style={{ background: "#fff" }}
                                autoFocus
                              />
                              <button onClick={submitEdit} aria-label="Valider la modification"><Check size={13} color={coral} /></button>
                              <button onClick={() => setEditingId(null)} aria-label="Annuler"><X size={13} color={muted} /></button>
                            </div>
                          ) : (
                            <p className="text-xs mt-0.5 whitespace-pre-wrap break-words">
                              {c.body}
                              {c.updated_at && <span className="ml-1" style={{ color: muted }}>(modifié)</span>}
                            </p>
                          )}
                        </div>
                        {!isEditing && (
                          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                            <button onClick={() => setReplyingTo(c)} aria-label="Répondre" className="focus-visible:outline focus-visible:outline-2"><Reply size={12} color={muted} /></button>
                            {c.author_id === currentUserId && (
                              <button onClick={() => startEdit(c)} aria-label="Modifier ce commentaire" className="focus-visible:outline focus-visible:outline-2"><Pencil size={12} color={muted} /></button>
                            )}
                            {(c.author_id === currentUserId || canModerate) && (
                              <button onClick={() => onDeleteComment(post.id, c.id)} aria-label="Supprimer ce commentaire" className="focus-visible:outline focus-visible:outline-2"><X size={12} color={muted} /></button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {replyingTo && (
                <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-lg" style={{ background: bg, color: muted }}>
                  <span className="truncate">Réponse à {replyingTo.profiles?.name || "un commentaire"}</span>
                  <button onClick={() => setReplyingTo(null)} aria-label="Annuler la réponse"><X size={12} /></button>
                </div>
              )}
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
