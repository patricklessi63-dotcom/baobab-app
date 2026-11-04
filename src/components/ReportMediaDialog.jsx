import React, { useEffect, useRef, useState } from "react";
import { Flag, X } from "lucide-react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { reportMedia, isModerationMissing } from "../lib/moderationApi";
import { friendlyDbError } from "../lib/friendlyDbError";

// Signalement d'UNE image (statut, publication, photo de communauté). Les signalements sont
// enregistrés côté serveur (report_media, supabase-moderation-text.sql) : un par personne et par
// image, plafonnés par heure ; plusieurs signalements indépendants masquent l'image en attendant un
// modérateur. Rien n'est supprimé automatiquement.
export const MEDIA_REPORT_REASONS = [
  ["sexuel", "Contenu sexuel ou nudité"],
  ["violence", "Violence ou contenu choquant"],
  ["haine", "Haine ou discrimination"],
  ["harcelement", "Harcèlement"],
  ["mineur", "Mineur en danger ou suspecté"],
  ["autre", "Autre"],
];

export default function ReportMediaDialog({ open, kind, targetId, onClose, onError }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [doneMessage, setDoneMessage] = useState("");
  const [error, setError] = useState("");
  const panelRef = useRef(null);
  useEscapeKey(open, onClose);
  useFocusTrap(open, panelRef);
  useEffect(() => { if (open) { setReason(""); setNote(""); setDoneMessage(""); setError(""); } }, [open]);
  if (!open) return null;

  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await reportMedia(kind, targetId, reason, note.trim() || null);
      setDoneMessage(res?.duplicate ? "Tu as déjà signalé cette image." : "Merci, ton signalement a été transmis à l'équipe.");
    } catch (e) {
      const msg = isModerationMissing(e) ? "Le signalement d'images n'est pas encore disponible." : friendlyDbError(e) || "Impossible d'envoyer le signalement. Réessaie.";
      setError(msg);
      onError?.(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "rgba(8,20,14,0.6)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Signaler cette image">
      <div ref={panelRef} tabIndex={-1} className="bb-card w-full sm:max-w-sm p-6" style={{ borderRadius: "20px 20px 0 0", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flag size={16} />
            <span style={{ fontFamily: "var(--bb-font-title)", fontWeight: 800, fontSize: 18, color: "var(--bb-text)" }}>Signaler cette image</span>
          </div>
          <button className="bb-hit" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        {doneMessage ? (
          <>
            <p role="status" className="text-sm mb-4" style={{ color: "var(--bb-text)" }}>{doneMessage}</p>
            <button onClick={onClose} className="w-full py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)", minHeight: 44 }}>Fermer</button>
          </>
        ) : (
          <>
        <fieldset className="mb-3">
          <legend className="text-xs font-bold mb-1.5" style={{ color: "var(--bb-text-faint)" }}>Pourquoi ?</legend>
          <div className="flex flex-col gap-1">
            {MEDIA_REPORT_REASONS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm py-1.5" style={{ color: "var(--bb-text)", minHeight: 36 }}>
                <input type="radio" name="media-report-reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block mb-3">
          <span className="text-xs font-bold" style={{ color: "var(--bb-text-faint)" }}>Précision (facultatif)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="bb-input w-full mt-1.5" />
        </label>
        {error && <p role="alert" className="text-sm mb-3" style={{ color: "var(--bb-coral-text, #C0392B)" }}>{error}</p>}
        <button onClick={submit} disabled={!reason || sending} className="bb-btn-danger w-full py-3 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ minHeight: 44 }}>
          {sending ? "Envoi..." : "Envoyer le signalement"}
        </button>
        <button onClick={onClose} className="w-full mt-2 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)", minHeight: 44 }}>Annuler</button>
          </>
        )}
      </div>
    </div>
  );
}
