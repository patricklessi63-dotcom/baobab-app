import React, { useState } from "react";
import { supabase } from "../../supabaseClient";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, navy, coral, muted, card, primaryRgb } from "./theme";
import { APP_VERSION, detectDevice, detectBrowser, detectCategories, detectPriority } from "../../lib/feedbackTriage";

// Auto-contenu (contrairement à ReportModal) : pas de state à faire
// remonter au parent, juste open/onClose/currentUser/screen. Écrit dans
// beta_feedback (voir supabase-beta-tracking.sql) — table dédiée à la beta
// privée, distincte des signalements de contenu (ReportModal/reports).
const REACTIONS = [
  ["jaime", "👍", "J'aime"],
  ["jaime_pas", "👎", "Je n'aime pas"],
  ["bug", "🐛", "Signaler un problème"],
  ["suggestion", "💡", "Suggestion"],
];

export default function BetaFeedbackModal({ open, onClose, currentUser, screen }) {
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(null);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  useEscapeKey(open, onClose);
  if (!open) return null;

  const handleClose = () => {
    onClose();
    setTimeout(() => { setMessage(""); setCategory(null); setSubmitted(false); setError(""); }, 200);
  };

  // Un tap sur une réaction rapide (👍/👎/🐛/💡) est déjà un signal utile
  // même sans commentaire — seul le texte libre (sans catégorie) reste
  // obligatoire, pour ne pas perdre le cas d'usage "Un souci, une idée ?"
  // existant.
  const canSubmit = Boolean(message.trim() || category);

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser) return;
    setSending(true);
    setError("");
    try {
      const trimmed = message.trim();
      // Pré-tri automatique par mots-clés (pas une vraie IA — voir
      // feedbackTriage.js) : gagne du temps de triage côté admin sans
      // jamais se substituer à une décision humaine.
      const { error: insertError } = await supabase
        .from("beta_feedback")
        .insert({
          profile_id: currentUser.id,
          message: trimmed,
          category,
          screen: screen || null,
          categories: detectCategories(trimmed),
          priority: detectPriority(trimmed),
          device: detectDevice(),
          browser: detectBrowser(),
          app_version: APP_VERSION,
        });
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
            <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Type de retour">
              {REACTIONS.map(([value, emoji, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={category === value}
                  aria-label={label}
                  onClick={() => setCategory((c) => (c === value ? null : value))}
                  className="flex-1 py-2.5 rounded-xl text-xl flex items-center justify-center focus-visible:outline focus-visible:outline-2"
                  style={{ background: category === value ? "rgba(225,107,93,.14)" : "var(--bb-bg)", border: category === value ? `1px solid ${coral}` : "1px solid transparent" }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Décris le bug ou ton idée... (facultatif si tu as choisi une réaction ci-dessus)"
              className="w-full p-3 rounded-lg text-sm"
              style={{ border: "1px solid var(--bb-border)", background: "var(--bb-surface-2)", color: primary }}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button onClick={handleClose} className="flex-1 py-2.5 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending || !canSubmit}
                className="bb-btn-gold flex-1 py-2.5 rounded-full text-sm font-bold disabled:opacity-50"
              >
                {sending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-black" style={{ color: primary }}>Merci !</h2>
            <p className="text-sm mt-2" style={{ color: muted }}>Ton retour a bien été transmis à l'équipe.</p>
            <button onClick={handleClose} className="bb-btn-gold w-full mt-4 py-2.5 rounded-full text-sm font-bold">
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
