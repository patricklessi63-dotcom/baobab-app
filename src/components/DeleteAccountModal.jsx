import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { C } from "../constants";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { requestAccountDeletion } from "../lib/deleteAccount";

// Confirmation explicite par saisie de texte — jamais déclenché par un
// simple clic accidentel (item 33 : pas de bouton trompeur, pas de case
// pré-cochée). Depuis le délai de grâce de 24h, cette action n'est
// plus la suppression elle-même — juste la demande, annulable (voir
// AccountDeletionBanner.jsx).
export default function DeleteAccountModal({ open, onClose, currentUser, onRequested }) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEscapeKey(open, onClose);
  // Cette modale reste montée en permanence (AppModals ne la démonte jamais,
  // elle rend juste `null` en interne) — sans ce reset, rouvrir la modale
  // après une fermeture sans confirmation laissait "SUPPRIMER" déjà saisi
  // (bouton de suppression actif sans nouvelle confirmation explicite) ou
  // une erreur d'une tentative précédente affichée à tort.
  useEffect(() => {
    if (open) { setConfirmText(""); setError(""); }
  }, [open]);
  if (!open) return null;

  const ready = confirmText.trim().toUpperCase() === "SUPPRIMER";
  const deletionDateTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const deletionDate = deletionDateTime.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
  const deletionTime = deletionDateTime.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });

  const handleDelete = async () => {
    if (!ready || loading || !currentUser) return;
    setLoading(true);
    setError("");
    try {
      await requestAccountDeletion(currentUser.id);
      onRequested();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "rgba(8,20,14,0.6)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Supprimer mon compte">
      <div className="bb-card w-full sm:max-w-sm p-6" style={{ borderRadius: "20px 20px 0 0" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} color={C.clay} />
            <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 19, color: "var(--bb-text)" }}>Supprimer mon compte</span>
          </div>
          <button onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: "rgba(var(--bb-ink-rgb),0.7)" }}>
          Ton compte sera définitivement supprimé le {deletionDate} à {deletionTime} (dans 24 heures) — profil, photos, matchs, messages, communautés, événements et abonnement inclus. Tu pourras annuler à tout moment avant cette date.
        </p>
        <label className="block mb-3">
          <span className="text-xs font-bold" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>Tape SUPPRIMER pour confirmer</span>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="bb-input w-full mt-1.5" placeholder="SUPPRIMER" autoComplete="off" />
        </label>
        {error && <p role="alert" className="text-sm mb-3" style={{ color: C.clay }}>{error}</p>}
        <button onClick={handleDelete} disabled={!ready || loading} className="w-full py-3 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ background: C.clay, minHeight: 44 }}>
          {loading ? "Enregistrement..." : "Programmer la suppression dans 24 heures"}
        </button>
        {/* Bug corrigé (même défaut que C.navy, passage 166) : C.ink est un
        jeton FIXE (fond crème fixe de l'onboarding), mais cette modale est
        en .bb-card à fond RÉACTIF — en thème sombre, texte quasi noir sur
        fond quasi noir. "var(--bb-text)" est l'équivalent réactif. */}
        <button onClick={onClose} className="w-full mt-2 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)", minHeight: 44 }}>
          Annuler
        </button>
      </div>
    </div>
  );
}
