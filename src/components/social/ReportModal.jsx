import React from "react";
import ChipSelect from "../ChipSelect";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, muted, card, primaryRgb } from "./theme";

const DEFAULT_CATEGORIES = [
  { value: "harcelement", label: "Harcèlement" },
  { value: "spam", label: "Spam" },
  { value: "faux_profil", label: "Faux profil" },
  { value: "contenu_inapproprie", label: "Contenu inapproprié" },
  { value: "arnaque", label: "Arnaque" },
  { value: "autre", label: "Autre" },
];

export default function ReportModal({
  target,
  category,
  setCategory,
  reason,
  setReason,
  sending,
  submitted,
  onCancel,
  onSubmit,
  onBlockAlso,
  onDismissAfterSubmit,
  categories = DEFAULT_CATEGORIES,
  targetLabel,
}) {
  useEscapeKey(Boolean(target) && !submitted, onCancel);
  if (!target) return null;

  const displayLabel = targetLabel || target.name;
  const categoryLabel = categories.find((c) => c.value === category)?.label || "";
  const commentRequired = category === "autre";
  const canSubmit = Boolean(category) && (!commentRequired || reason.trim());

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}
      onClick={submitted ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={submitted ? "Signalement envoyé" : `Signaler ${displayLabel}`}
    >
      <div className={`${card} p-6 max-w-sm w-full`} onClick={(e) => e.stopPropagation()}>
        {!submitted ? (
          <>
            <h2 className="text-lg font-black" style={{ color: primary }}>Signaler {displayLabel}</h2>
            <p className="text-sm mt-1 mb-3" style={{ color: muted }}>Choisis un motif — on examinera ton signalement.</p>

            <ChipSelect
              options={categories.map((c) => c.label)}
              value={categoryLabel}
              onChange={(label) => setCategory(categories.find((c) => c.label === label)?.value || "")}
            />

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={commentRequired ? "Explique brièvement pourquoi (obligatoire pour \"Autre\")..." : "Commentaire (facultatif)..."}
              className="w-full p-3 rounded-lg text-sm mt-3"
              style={{ border: `1px solid rgba(${primaryRgb},.12)` }}
            />

            <div className="flex gap-2 mt-4">
              <button onClick={onCancel} className="flex-1 py-2.5 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
                Annuler
              </button>
              <button
                onClick={onSubmit}
                disabled={sending || !canSubmit}
                className="flex-1 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-50"
                style={{ background: coral }}
              >
                {sending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-black" style={{ color: primary }}>Signalement envoyé</h2>
            {onBlockAlso ? (
              <>
                <p className="text-sm mt-2" style={{ color: muted }}>
                  Veux-tu aussi bloquer {displayLabel} ? Cette personne ne pourra
                  alors plus t'écrire ni voir ton profil.
                </p>
                <div className="flex gap-2 mt-4">
                  <button onClick={onDismissAfterSubmit} className="flex-1 py-2.5 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
                    Ne pas bloquer
                  </button>
                  <button onClick={() => onBlockAlso(target)} className="flex-1 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: coral }}>
                    Bloquer
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm mt-2" style={{ color: muted }}>Merci, notre équipe va l'examiner.</p>
                <button onClick={onDismissAfterSubmit} className="w-full mt-4 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: primary }}>
                  Fermer
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
