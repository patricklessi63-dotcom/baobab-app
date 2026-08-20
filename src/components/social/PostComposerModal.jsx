import React from "react";
import { X, Image as ImageIcon, Camera } from "lucide-react";
import Avatar from "../Avatar";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import AiSuggestButton from "../ai/AiSuggestButton";
import { primary, green, coral, bg, muted, primaryRgb } from "./theme";

export default function PostComposerModal({
  composer,
  onRequestClose,
  currentUser,
  draft,
  setDraft,
  composerMedia,
  composerMediaKind,
  pickMedia,
  onMediaSelected,
  photoInputRef,
  videoInputRef,
  publish,
  exitConfirmOpen,
  onCancelExit,
  onSaveDraft,
  onDiscard,
  draftSavedNotice,
  resumedDraft,
  onDiscardResumed,
}) {
  useEscapeKey(composer, () => (exitConfirmOpen ? onCancelExit() : onRequestClose()));
  const canPublish = Boolean(draft.trim() || composerMedia);
  return (
    <>
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onMediaSelected(e, "photo")} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onMediaSelected(e, "video")} />
      {composer && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }} onClick={onRequestClose} role="dialog" aria-modal="true" aria-label="Créer une publication">
          <div className="bg-white w-full max-w-xl rounded-t-[30px] md:rounded-[30px] p-5 md:p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            {draftSavedNotice ? (
              <div className="py-10 text-center">
                <div className="text-3xl mb-2">✓</div>
                <p className="text-sm font-bold" style={{ color: primary }}>Publication enregistrée dans tes brouillons.</p>
              </div>
            ) : exitConfirmOpen ? (
              <div className="py-2">
                <h2 className="text-lg font-black" style={{ color: primary }}>Tu n'as pas terminé ta publication.</h2>
                <p className="text-sm mt-2" style={{ color: muted }}>Que veux-tu faire avant de quitter ?</p>
                <div className="flex flex-col gap-2 mt-5">
                  <button onClick={onSaveDraft} className="w-full rounded-xl py-3 font-bold text-white" style={{ background: primary }}>Enregistrer en brouillon</button>
                  <button onClick={onDiscard} className="w-full rounded-xl py-3 font-bold" style={{ background: "#FFF3F1", color: coral }}>Abandonner</button>
                  <button onClick={onCancelExit} className="w-full rounded-xl py-3 font-semibold" style={{ color: muted }}>Annuler</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-black truncate" style={{ color: primary }}>Créer une publication</h2>
                    <p className="text-xs mt-0.5" style={{ color: muted }}>Partage quelque chose d'utile, drôle ou inspirant.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={publish} disabled={!canPublish} className="rounded-xl px-4 py-2.5 text-sm text-white font-bold disabled:opacity-40" style={{ background: primary }}>Publier</button>
                    <button onClick={onRequestClose} aria-label="Fermer" className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: bg }}><X size={18} /></button>
                  </div>
                </div>
                {resumedDraft && (
                  <div className="flex items-center justify-between gap-2 mt-3 px-3 py-2 rounded-xl text-xs" style={{ background: "#FFF9F0", color: "#A5761F" }}>
                    <span>Brouillon repris.</span>
                    <button onClick={onDiscardResumed} className="font-bold underline underline-offset-2">Effacer</button>
                  </div>
                )}
                <div className="flex gap-3 mt-5">
                  <Avatar name={currentUser?.name || "Toi"} url={currentUser?.avatar_url} size={40} />
                  <div className="flex-1">
                    <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full min-h-32 rounded-2xl p-4 outline-none resize-none" style={{ background: bg }} placeholder="Écris ton message..." />
                    {currentUser?.ai_suggestions_enabled !== false && (
                      <AiSuggestButton
                        action="improve_post"
                        label="Améliorer mon texte"
                        buildPayload={() => ({ text: draft })}
                        onApply={setDraft}
                        disabled={!draft.trim()}
                      />
                    )}
                  </div>
                </div>
                {composerMedia && <div className="mt-3 rounded-2xl overflow-hidden bg-black max-h-56">{composerMediaKind === "video" ? <video src={URL.createObjectURL(composerMedia)} controls className="w-full max-h-56 object-contain" /> : <img src={URL.createObjectURL(composerMedia)} alt="" className="w-full max-h-56 object-contain" />}</div>}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button onClick={() => pickMedia("photo")} className="rounded-xl py-3 font-bold" style={{ background: "#FFF3F1", color: coral }}><ImageIcon size={17} className="inline mr-1" />Ajouter une photo</button>
                  <button onClick={() => pickMedia("video")} className="rounded-xl py-3 font-bold" style={{ background: "#EEF8F4", color: green }}><Camera size={17} className="inline mr-1" />Ajouter une vidéo</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
