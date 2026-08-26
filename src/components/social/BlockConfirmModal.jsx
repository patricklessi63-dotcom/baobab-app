import React, { useRef, useState } from "react";
import { Ban } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { primary, coral, muted, card, primaryRgb } from "./theme";

export default function BlockConfirmModal({ target, onCancel, onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  useEscapeKey(Boolean(target) && !confirming, onCancel);
  const dialogRef = useRef(null);
  useFocusTrap(Boolean(target), dialogRef);
  if (!target) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm(target);
    setConfirming(false);
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}
      onClick={confirming ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={`Bloquer ${target.name}`}
    >
      <div ref={dialogRef} tabIndex={-1} className={`${card} p-6 max-w-xs w-full text-center`} onClick={(e) => e.stopPropagation()}>
        <div className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
          <Ban size={24} color={coral} />
        </div>
        <h2 className="text-lg font-black" style={{ color: primary }}>Bloquer {target.name} ?</h2>
        <p className="text-sm mt-2" style={{ color: muted }}>
          Cette personne ne pourra plus t'écrire ni voir ton profil. Elle ne
          sera pas informée que tu l'as bloquée.
        </p>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} disabled={confirming} className="flex-1 py-2.5 rounded-full text-sm font-semibold disabled:opacity-50" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
            Annuler
          </button>
          <button onClick={handleConfirm} disabled={confirming} className="flex-1 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-50" style={{ background: coral }}>
            {confirming ? "Blocage..." : "Bloquer"}
          </button>
        </div>
      </div>
    </div>
  );
}
