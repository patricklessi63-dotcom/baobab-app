import React, { useState } from "react";
import { Send, Trash2 } from "lucide-react";
import Avatar from "../Avatar";
import EmptyState from "../home/EmptyState";
import Skeleton from "../Skeleton";
import ConfirmModal from "./ConfirmModal";
import { primary, muted, bg, body, primaryRgb } from "./theme";
import { truncateUnicodeSafe } from "../../utils/format";

// Discussion légère liée à l'événement — table event_comments dédiée,
// pas une extension de la messagerie 1:1 (voir rapport final pour le
// raisonnement : messages.match_key ne modélise que des conversations à
// deux personnes, comme community_comments en Phase 6).
export default function EventCommentsSection({ comments = [], loading, canPost, draft, setDraft, currentUserId, onSubmit, onDelete, canModerate }) {
  const trimmed = (draft || "").trim();
  // Remplace l'ancien window.confirm() — voir ConfirmModal.jsx.
  const [pendingDelete, setPendingDelete] = useState(null);

  return (
    <div>
      {canPost && (
        <div className="flex items-center gap-2 pb-4 mb-3" style={{ borderBottom: `1px solid rgba(${primaryRgb},.06)` }}>
          <input
            dir="auto"
            value={draft}
            onChange={(e) => setDraft(truncateUnicodeSafe(e.target.value, 1000))}
            placeholder="Écris un message pour les participants…"
            className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]"
            style={{ background: bg }}
            onKeyDown={(e) => { if (e.key === "Enter" && trimmed) { onSubmit(); } }}
          />
          <button
            onClick={onSubmit}
            disabled={!trimmed}
            aria-label="Envoyer"
            className="bb-btn-gold h-10 w-10 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
      )}

      {loading ? (
        <Skeleton rows={3} height={44} />
      ) : comments.length === 0 ? (
        <EmptyState title="Aucun message pour l'instant." subtitle="Lance la discussion avec les autres participants." />
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => {
            const profile = c.profiles || {};
            const canDelete = c.author_id === currentUserId || canModerate;
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                <Avatar name={profile.name} url={profile.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold" style={{ color: primary }}>{profile.name || "Utilisateur"}</div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap break-words" style={{ color: body }}>{c.body}</p>
                </div>
                {canDelete && (
                  <button onClick={() => setPendingDelete(c)} aria-label="Supprimer ce message" className="flex-shrink-0" style={{ color: muted }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Supprimer ce message ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => { onDelete(pendingDelete); setPendingDelete(null); }}
      />
    </div>
  );
}
