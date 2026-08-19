import React, { useState } from "react";
import { supabase } from "../../supabaseClient";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, muted, card, primaryRgb } from "./theme";

// Auto-contenu (contrairement à ReportModal) : pas de state à faire
// remonter au parent, juste open/onClose/currentUser/screen. Écrit dans
// beta_feedback (voir supabase-beta-tracking.sql) — table dédiée à la beta
// privée, distincte des signalements de contenu (ReportModal/reports).
export default function BetaFeedbackModal({ open, onClose, currentUser, screen }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  useEscapeKey(open, onClose);
  if (!open) return null;

  const handleClose = () => {
    onClose();
    setTimeout(() => { setMessage(""); setSubmitted(false); setError(""); }, 200);
  };

  const handleSubmit = async () => {
    if (!message.trim() || !currentUser) return;
    setSending(true);
    setError("");
    try {
      const { error: insertError } = await supabase
        .from("beta_feedback")
        .insert({ profile_id: currentUser.id, message: message.trim(), screen: screen || null });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setError("Impossible d'envoyer ton message. Réessaie.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Envoyer un retour beta"
    >
      <div className={`${card} p-6 max-w-sm w-full`} onClick={(e) => e.stopPropagation()}>
        {!submitted ? (
          <>
            <h2 className="text-lg font-black" style={{ color: primary }}>Un souci, une idée ?</h2>
            <p className="text-sm mt-1 mb-3" style={{ color: muted }}>
              Baobab est en beta privée — ton retour va directement à l'équipe.
            </p>
            {error && <p className="text-sm mb-2" style={{ color: coral }}>{error}</p>}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Décris le bug ou ton idée..."
              className="w-full p-3 rounded-lg text-sm"
              style={{ border: `1px solid rgba(${primaryRgb},.12)` }}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button onClick={handleClose} className="flex-1 py-2.5 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending || !message.trim()}
                className="flex-1 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-50"
                style={{ background: coral }}
              >
                {sending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-black" style={{ color: primary }}>Merci !</h2>
            <p className="text-sm mt-2" style={{ color: muted }}>Ton retour a bien été transmis à l'équipe.</p>
            <button onClick={handleClose} className="w-full mt-4 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: primary }}>
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
