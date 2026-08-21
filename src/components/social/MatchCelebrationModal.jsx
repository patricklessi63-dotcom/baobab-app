import React from "react";
import { Heart, MessageCircle } from "lucide-react";
import Avatar from "../Avatar";
import { C } from "../../constants";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export default function MatchCelebrationModal({ match, currentUser, onStartChat, onDismiss }) {
  useEscapeKey(Boolean(match), onDismiss);
  if (!match) return null;
  return (
    <div
      className="bb-fade-in fixed inset-0 flex items-center justify-center z-[90] p-5"
      style={{ background: "rgba(20,29,56,0.72)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Nouvelle connexion"
      onClick={onDismiss}
    >
      <div className="bb-card p-8 max-w-sm w-full text-center" style={{ boxShadow: "var(--bb-shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
        <div className="text-5xl mb-3" aria-hidden="true">🎉</div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 24, color: C.indigo }}>
          C'est un match !
        </h2>

        <div className="flex items-center justify-center gap-3 mt-5">
          <Avatar name={currentUser?.name} url={currentUser?.avatar_url} size={64} />
          <Heart size={22} color={C.clay} fill={C.clay} aria-hidden="true" />
          <Avatar name={match.name} url={match.avatar_url} size={64} />
        </div>

        <p className="text-sm mt-4" style={{ color: "rgba(var(--bb-ink-rgb),0.7)" }}>
          {match.name} et toi avez tous les deux choisi de vous découvrir.
        </p>

        <button
          onClick={onStartChat}
          className="bb-btn bb-btn-primary w-full mt-6 py-3 rounded-full font-semibold text-sm flex items-center justify-center gap-2"
        >
          <MessageCircle size={16} /> Commencer la conversation
        </button>
        <button
          onClick={onDismiss}
          className="w-full mt-2 py-2.5 text-sm font-semibold"
          style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
