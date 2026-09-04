import React, { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { primary, coral, muted, card, primaryRgb } from "./theme";

// Modale de confirmation générique, même habillage que BlockConfirmModal —
// remplace les window.confirm() natifs dispersés dans l'app (suppression de
// publication/commentaire/communauté/événement/message/photo, annulation
// d'événement, retrait de membre...) : un window.confirm() casse l'esthétique
// très travaillée du reste de l'UI et n'a pas un rendu cohérent d'un
// navigateur/OS à l'autre.
//
// Usage : `const [pending, setPending] = useState(null);` déclenché au clic
// (`setPending(item)`) au lieu de window.confirm(), puis :
// <ConfirmModal open={Boolean(pending)} title="..." message="..."
//   onCancel={() => setPending(null)}
//   onConfirm={async () => { await doThing(pending); setPending(null); }} />
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
  danger = true,
  onCancel,
  onConfirm,
}) {
  const [confirming, setConfirming] = useState(false);
  useEscapeKey(Boolean(open) && !confirming, onCancel);
  const dialogRef = useRef(null);
  useFocusTrap(Boolean(open), dialogRef);
  if (!open) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}
      onClick={confirming ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div ref={dialogRef} tabIndex={-1} className={`${card} p-6 max-w-xs w-full text-center`} onClick={(e) => e.stopPropagation()}>
        <div className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
          <AlertTriangle size={24} color={coral} />
        </div>
        <h2 className="text-lg font-black" style={{ color: primary }}>{title}</h2>
        {message && (
          <p className="text-sm mt-2" style={{ color: muted }}>
            {message}
          </p>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} disabled={confirming} className="flex-1 py-2.5 rounded-full text-sm font-semibold disabled:opacity-50" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
            {cancelLabel}
          </button>
          <button onClick={handleConfirm} disabled={confirming} className="flex-1 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-50" style={{ background: danger ? coral : primary }}>
            {confirming ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
