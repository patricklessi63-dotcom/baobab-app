import React from "react";
import Avatar from "../Avatar";
import { coral, bg, muted } from "./theme";

const MAX_LENGTH = 4000; // miroir de la contrainte community_posts.body

export default function CommunityPostComposer({ currentUser, draft, setDraft, onSubmit, submitting }) {
  return (
    <div className="flex gap-3">
      <Avatar name={currentUser?.name} url={currentUser?.avatar_url} size={38} />
      <div className="flex-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Qui va au match samedi ?"
          aria-label="Écrire une publication"
          rows={2}
          className="w-full text-sm rounded-2xl px-4 py-3 outline-none resize-none"
          style={{ background: bg }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px]" style={{ color: muted }}>{draft.length}/{MAX_LENGTH}</span>
          <button
            onClick={onSubmit}
            disabled={submitting || !draft.trim()}
            className="text-xs font-bold px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ background: coral }}
          >
            {submitting ? "Publication..." : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}
