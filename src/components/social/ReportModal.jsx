import React, { useRef } from "react";
import ChipSelect from "../ChipSelect";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { primary, navy, coral, muted, card, primaryRgb } from "./theme";

const DEFAULT_CATEGORIES = [
  { value: "harcelement", label: "Harcèlement" },
  { value: "spam", label: "Spam" },
  { value: "faux_profil", label: "Faux profil" },
  { value: "contenu_inapproprie", label: "Contenu inapproprié" },
  { value: "arnaque", label: "Arnaque" },
  // Catégorie à part (pas fondue dans "faux profil") : priorité de
  // traitement la plus haute (prompt-securite-verification-moderation-baobab.md)
  // — voir la mise à jour correspondante d'admin_list_reports() qui trie ces
  // signalements en premier.
  { value: "mineur_suspecte", label: "Mineur suspecté" },
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
  // Bug corrigé : la garde utilisait `!submitted` au lieu de `!sending`.
  // Le bouton "Annuler" est `disabled={sending}` (voir commentaire plus bas)
  // pour empêcher de fermer la modale pendant que submitReport() est encore
  // en vol — sinon sa résolution tardive écrase `submitted` à true pour un
  // signalement déjà annulé/rouvert sur une autre cible, affichant "Signalement
  // envoyé" sans qu'aucun signalement n'ait réellement été envoyé pour la
  // cible affichée. Mais Échap et le bouton "retour" (mobile/navigateur)
  // passaient par ce hook, qui ne vérifiait pas `sending` — ils pouvaient
  // donc déclencher exactement la même course que le bouton empêche.
  useEscapeKey(Boolean(target) && !sending, onCancel);
  const dialogRef = useRef(null);
  useFocusTrap(Boolean(target), dialogRef);
  if (!target) return null;

  const displayLabel = targetLabel || target.name;
  const categoryLabel = categories.find((c) => c.value === category)?.label || "";
  const commentRequired = category === "autre";
  const canSubmit = Boolean(category) && (!commentRequired || reason.trim());

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}
      onClick={submitted || sending ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={submitted ? "Signalement envoyé" : `Signaler ${displayLabel}`}
    >
      <div ref={dialogRef} tabIndex={-1} className={`${card} p-6 max-w-sm w-full`} onClick={(e) => e.stopPropagation()}>
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
              // Bug corrigé (même pattern que les commentaires événement/
              // communauté, plafonnés à 1000 caractères) : ce champ était le
              // seul texte libre de l'app sans aucune limite de longueur —
              // reports.reason est une colonne "text" illimitée côté base,
              // rien n'empêchait de coller un pavé de plusieurs Mo.
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder={commentRequired ? "Explique brièvement pourquoi (obligatoire pour \"Autre\")..." : "Commentaire (facultatif)..."}
              className="w-full p-3 rounded-lg text-sm mt-3"
              style={{ border: "1px solid var(--bb-border)", background: "var(--bb-surface-2)", color: primary }}
            />

            <div className="flex gap-2 mt-4">
              {/* disabled={sending} : sinon un clic pendant l'envoi met reportTarget/
                  reportSubmitted à zéro (fermeture) alors que submitReport() continue
                  en vol — si l'utilisateur rouvre aussitôt cette modale pour signaler
                  quelqu'un d'autre, la résolution tardive de l'ancien envoi écrasait
                  submitted à true et affichait "Signalement envoyé" pour ce nouveau
                  signalement, jamais réellement envoyé. */}
              <button onClick={onCancel} disabled={sending} className="flex-1 py-2.5 rounded-full text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
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
                <button onClick={onDismissAfterSubmit} className="bb-btn-gold w-full mt-4 py-2.5 rounded-full text-sm font-bold">
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
