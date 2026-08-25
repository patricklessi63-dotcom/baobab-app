import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { X, Image as ImageIcon, Camera, ChevronUp, ChevronDown, RotateCcw, Loader2, Check } from "lucide-react";
import Avatar from "../Avatar";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import AiSuggestButton from "../ai/AiSuggestButton";
import EmojiPicker from "./EmojiPicker";
import PostMediaGrid from "./PostMediaGrid";
import PostDropZone from "./PostDropZone";
import { formatFileSize } from "../../lib/mediaConstants";
import { primary, navy, green, coral, bg, muted, primaryRgb } from "./theme";

export default function PostComposerModal({
  composer,
  onRequestClose,
  currentUser,
  draft,
  setDraft,
  mediaItems,
  uploadStates,
  publishing,
  publishedPostId,
  pickMedia,
  onMediaSelected,
  onFilesSelected,
  onRemoveMediaItem,
  onMoveMediaItem,
  onRetryMediaItem,
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
  const textareaRef = useRef(null);
  const dialogRef = useRef(null);
  useFocusTrap(Boolean(composer), dialogRef);
  const canPublish = Boolean(draft.trim() || mediaItems.length > 0);
  const hasFailedMedia = mediaItems.some((it) => uploadStates[it.id]?.status === "error");
  const hasPendingMedia = mediaItems.some((it) => uploadStates[it.id]?.status !== "done");

  // Insère l'emoji à la position du curseur dans le textarea (plutôt qu'à
  // la fin) — comportement attendu de tout sélecteur emoji moderne.
  const insertEmoji = (emoji) => {
    const el = textareaRef.current;
    if (!el) { setDraft((d) => d + emoji); return; }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  const gridItems = mediaItems.map((it) => ({ url: it.previewUrl, kind: it.kind }));

  return (
    <>
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onMediaSelected(e, "photo")} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => onMediaSelected(e, "video")} />
      {composer && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }} onClick={onRequestClose} role="dialog" aria-modal="true" aria-label="Créer une publication">
          <div ref={dialogRef} tabIndex={-1} className="bg-[var(--bb-surface)] w-full max-w-xl rounded-t-[30px] md:rounded-[30px] shadow-2xl relative flex flex-col" style={{ maxHeight: "88dvh", paddingBottom: "env(safe-area-inset-bottom)" }} onClick={(e) => e.stopPropagation()}>
            {draftSavedNotice ? (
              <div className="py-10 text-center p-5 md:p-6">
                <div className="text-3xl mb-2">✓</div>
                <p className="text-sm font-bold" style={{ color: primary }}>Publication enregistrée dans tes brouillons.</p>
              </div>
            ) : exitConfirmOpen ? (
              <div className="py-2 p-5 md:p-6">
                <h2 className="text-lg font-black" style={{ color: primary }}>Tu n'as pas terminé ta publication.</h2>
                <p className="text-sm mt-2" style={{ color: muted }}>Que veux-tu faire avant de quitter ?</p>
                <div className="flex flex-col gap-2 mt-5">
                  <button onClick={onSaveDraft} className="w-full rounded-xl py-3 font-bold text-white" style={{ background: navy }}>Enregistrer en brouillon</button>
                  <button onClick={onDiscard} className="w-full rounded-xl py-3 font-bold" style={{ background: "#FFF3F1", color: coral }}>Abandonner</button>
                  <button onClick={onCancelExit} className="w-full rounded-xl py-3 font-semibold" style={{ color: muted }}>Annuler</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 p-5 md:p-6 pb-3 shrink-0" style={{ borderBottom: "1px solid rgba(var(--bb-ink-rgb),0.06)" }}>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black truncate" style={{ color: primary }}>Créer une publication</h2>
                    <p className="text-xs mt-0.5" style={{ color: muted }}>Partage quelque chose d'utile, drôle ou inspirant.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {publishedPostId ? (
                      hasPendingMedia ? (
                        <button onClick={publish} disabled={publishing} className="rounded-xl px-4 py-2.5 text-sm text-white font-bold disabled:opacity-60 flex items-center gap-1.5" style={{ background: navy }}>
                          {publishing && <Loader2 size={14} className="animate-spin" />} Réessayer
                        </button>
                      ) : (
                        <button onClick={onRequestClose} className="rounded-xl px-4 py-2.5 text-sm text-white font-bold" style={{ background: navy }}>Terminé</button>
                      )
                    ) : (
                      <button onClick={publish} disabled={!canPublish || publishing} className="rounded-xl px-4 py-2.5 text-sm text-white font-bold disabled:opacity-40 flex items-center gap-1.5" style={{ background: navy }}>
                        {publishing && <Loader2 size={14} className="animate-spin" />} {publishing ? "Publication..." : "Publier"}
                      </button>
                    )}
                    <button onClick={onRequestClose} aria-label="Fermer" className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: bg }}><X size={18} /></button>
                  </div>
                </div>
                <PostDropZone onDropFiles={onFilesSelected}>
                  <div className="overflow-y-auto p-5 md:p-6 pt-3">
                    {resumedDraft && (
                      <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl text-xs" style={{ background: "#FFF9F0", color: "#A5761F" }}>
                        <span>Brouillon repris.</span>
                        <button onClick={onDiscardResumed} className="font-bold underline underline-offset-2">Effacer</button>
                      </div>
                    )}
                    {publishedPostId && hasFailedMedia && (
                      <div className="mb-3 px-3 py-2 rounded-xl text-xs" style={{ background: "#FFF3F1", color: coral }}>
                        Ta publication est en ligne. Certains fichiers n'ont pas pu être envoyés — réessaie ci-dessous, ou touche "Terminé" pour laisser tel quel.
                      </div>
                    )}
                    <div className="flex gap-3">
                      <Avatar name={currentUser?.name || "Toi"} url={currentUser?.avatar_url} size={40} />
                      <div className="flex-1">
                        <textarea
                          ref={textareaRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
                          disabled={Boolean(publishedPostId)}
                          className="w-full min-h-32 rounded-2xl p-4 outline-none resize-none disabled:opacity-70"
                          style={{ background: bg }}
                          placeholder="Écris ton message..."
                        />
                        <div className="flex items-center justify-between mt-1">
                          {currentUser?.ai_suggestions_enabled !== false && !publishedPostId ? (
                            <AiSuggestButton
                              action="improve_post"
                              label="Améliorer mon texte"
                              buildPayload={() => ({ text: draft })}
                              onApply={setDraft}
                              disabled={!draft.trim()}
                            />
                          ) : <span />}
                          <span className="text-[11px]" style={{ color: draft.length > 3800 ? coral : muted }}>{draft.length}/4000</span>
                        </div>
                      </div>
                    </div>

                    {mediaItems.length > 0 && (
                      <PostMediaGrid
                        items={gridItems}
                        className="mt-3 rounded-2xl overflow-hidden"
                        maxVisible={mediaItems.length}
                        renderOverlay={(_, i) => {
                          const it = mediaItems[i];
                          const state = uploadStates[it.id];
                          return (
                            <>
                              {!publishedPostId && (
                                <div className="absolute top-1.5 right-1.5 flex gap-1">
                                  {i > 0 && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); onMoveMediaItem(it.id, "up"); }} aria-label="Déplacer avant" className="h-6 w-6 rounded-full bg-black/55 text-white flex items-center justify-center"><ChevronUp size={13} /></button>
                                  )}
                                  {i < mediaItems.length - 1 && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); onMoveMediaItem(it.id, "down"); }} aria-label="Déplacer après" className="h-6 w-6 rounded-full bg-black/55 text-white flex items-center justify-center"><ChevronDown size={13} /></button>
                                  )}
                                  <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveMediaItem(it.id); }} aria-label="Retirer ce média" className="h-6 w-6 rounded-full bg-black/55 text-white flex items-center justify-center"><X size={13} /></button>
                                </div>
                              )}
                              {it.kind === "video" && (
                                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 text-white text-[10px] font-bold px-1.5 py-0.5">
                                  {formatFileSize(it.file.size)}
                                </span>
                              )}
                              {state?.status === "uploading" && (
                                <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-1.5 text-white">
                                  <Loader2 size={20} className="animate-spin" />
                                  <span className="text-[11px] font-bold">{state.progress}%</span>
                                </div>
                              )}
                              {state?.status === "done" && (
                                <span className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-white flex items-center justify-center"><Check size={12} color={green} /></span>
                              )}
                              {state?.status === "error" && (
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 text-white text-center px-2">
                                  <span className="text-[11px] font-semibold">Échec de l'envoi</span>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); onRetryMediaItem(it.id); }} className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: coral }}>
                                    <RotateCcw size={11} /> Réessayer
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        }}
                      />
                    )}

                    {!publishedPostId && (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <button onClick={() => pickMedia("photo")} className="rounded-xl py-3 font-bold text-xs sm:text-sm" style={{ background: "#FFF3F1", color: coral }}><ImageIcon size={17} className="inline mr-1" />Photo</button>
                        <button onClick={() => pickMedia("video")} className="rounded-xl py-3 font-bold text-xs sm:text-sm" style={{ background: "#EEF8F4", color: green }}><Camera size={17} className="inline mr-1" />Vidéo</button>
                        <div className="rounded-xl flex items-center justify-center" style={{ background: "#FFF9F0" }}>
                          <EmojiPicker onPick={insertEmoji} currentUserId={currentUser?.id} />
                        </div>
                      </div>
                    )}
                  </div>
                </PostDropZone>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
