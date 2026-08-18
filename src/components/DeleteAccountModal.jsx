import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { C } from "../constants";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { deleteAccountPermanently } from "../lib/deleteAccount";

// Confirmation explicite par saisie de texte — irréversible, jamais
// déclenché par un simple clic accidentel (item 33 : pas de bouton
// trompeur, pas de case pré-cochée).
export default function DeleteAccountModal({ open, onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEscapeKey(open, onClose);
  if (!open) return null;

  const ready = confirmText.trim().toUpperCase() === "SUPPRIMER";

  const handleDelete = async () => {
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    try {
      await deleteAccountPermanently();
      onDeleted();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(20,29,56,0.6)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Supprimer mon compte">
      <div className="bb-card w-full sm:max-w-sm p-6" style={{ borderRadius: "20px 20px 0 0" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} color={C.clay} />
            <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 19, color: C.indigo }}>Supprimer mon compte</span>
          </div>
          <button onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: "rgba(43,36,32,0.7)" }}>
          Cette action est définitive. Ton profil, tes photos, tes matchs, tes messages, tes communautés, tes événements et ton abonnement seront supprimés. Impossible à annuler.
        </p>
        <label className="block mb-3">
          <span className="text-xs font-bold" style={{ color: "rgba(43,36,32,0.6)" }}>Tape SUPPRIMER pour confirmer</span>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="bb-input w-full mt-1.5" placeholder="SUPPRIMER" autoComplete="off" />
        </label>
        {error && <p role="alert" className="text-sm mb-3" style={{ color: C.clay }}>{error}</p>}
        <button onClick={handleDelete} disabled={!ready || loading} className="w-full py-3 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ background: C.clay, minHeight: 44 }}>
          {loading ? "Suppression..." : "Supprimer définitivement mon compte"}
        </button>
        <button onClick={onClose} className="w-full mt-2 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(43,36,32,0.15)", color: C.ink, minHeight: 44 }}>
          Annuler
        </button>
      </div>
    </div>
  );
}
