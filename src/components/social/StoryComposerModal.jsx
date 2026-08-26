import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Image as ImageIcon, Camera, ArrowLeft } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, navy, green, coral, gold, bg, primaryRgb } from "./theme";

// Fonds proposés pour un statut texte — palette Baobab (pas de bleu
// Facebook), cohérente avec STORY_COLORS de SocialShell.jsx.
const BG_PRESETS = [coral, "#5667A9", green, gold, navy, "#C1613D"];

export default function StoryComposerModal({
  storyComposer,
  setStoryComposer,
  storyText,
  setStoryText,
  storyMedia,
  setStoryMedia,
  storyMediaKind,
  setStoryMediaKind,
  storyMediaError,
  storyMediaWarning,
  storyUploading,
  storyUploadProgress,
  storyBgColor,
  setStoryBgColor,
  storyStep,
  setStoryStep,
  pickStoryMedia,
  onStoryMediaSelected,
  storyPhotoInputRef,
  storyVideoInputRef,
  addStory,
}) {
  useEscapeKey(storyComposer, () => setStoryComposer(false));
  const canContinue = Boolean(storyText.trim() || storyMedia);
  const previewBg = storyBgColor || BG_PRESETS[0];

  // Une seule URL blob par fichier sélectionné, révoquée au changement/
  // démontage — auparavant recréée à chaque rendu (ex. à chaque frappe dans
  // la légende pendant qu'un média est joint), ce qui fuyait une URL objet
  // en mémoire à chaque caractère tapé sans jamais la libérer.
  const mediaPreviewUrl = useMemo(() => (storyMedia ? URL.createObjectURL(storyMedia) : null), [storyMedia]);
  useEffect(() => {
    return () => { if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl); };
  }, [mediaPreviewUrl]);

  const handleClose = () => setStoryComposer(false);
  const goPreview = () => { if (canContinue) setStoryStep("preview"); };

  return (
    <>
      <input ref={storyPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onStoryMediaSelected(e, "photo")} />
      <input ref={storyVideoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onStoryMediaSelected(e, "video")} />
      {storyComposer && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }} onClick={handleClose} role="dialog" aria-modal="true" aria-label="Nouveau statut">
          <div className="bg-[var(--bb-surface)] w-full max-w-md rounded-t-[30px] md:rounded-[30px] shadow-2xl flex flex-col" style={{ maxHeight: "88dvh", paddingBottom: "env(safe-area-inset-bottom)" }} onClick={(e) => e.stopPropagation()}>
            {storyStep === "compose" ? (
              <>
                <div className="flex items-center justify-between p-6 pb-0 shrink-0">
                  <h2 className="text-xl font-black" style={{ color: primary }}>Nouveau statut</h2>
                  <button onClick={handleClose} aria-label="Fermer"><X /></button>
                </div>
                <div className="overflow-y-auto p-6">
                  <textarea value={storyText} onChange={(e) => setStoryText(e.target.value)} maxLength={280} className="mt-5 w-full min-h-28 rounded-2xl p-4 outline-none resize-none" style={{ background: bg }} placeholder="Une pensée, une bonne nouvelle, un moment de ta journée…" />
                  {storyMedia && (
                    <div className="mt-3 rounded-2xl overflow-hidden bg-black max-h-56 relative">
                      {storyMediaKind === "video" ? (
                        <video src={mediaPreviewUrl} controls className="w-full max-h-56 object-contain" />
                      ) : (
                        <img src={mediaPreviewUrl} alt="" className="w-full max-h-56 object-contain" />
                      )}
                      <button onClick={() => { setStoryMedia(null); setStoryMediaKind(""); }} aria-label="Retirer le média" className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {!storyMedia && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold mb-2" style={{ color: primary, opacity: 0.6 }}>Fond de couleur</p>
                      <div className="flex gap-2">
                        {BG_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setStoryBgColor(c === storyBgColor ? "" : c)}
                            aria-label={`Fond ${c}`}
                            aria-pressed={storyBgColor === c || (!storyBgColor && c === BG_PRESETS[0])}
                            className="h-9 w-9 rounded-full shrink-0"
                            style={{
                              background: c,
                              border: (storyBgColor === c || (!storyBgColor && c === BG_PRESETS[0])) ? `2px solid ${primary}` : "2px solid transparent",
                              boxShadow: "0 1px 3px rgba(0,0,0,.15)",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {storyMediaError && <p className="text-xs mt-2" style={{ color: coral }}>{storyMediaError}</p>}
                  {!storyMediaError && storyMediaWarning && <p className="text-xs mt-2" style={{ color: "#A5761F" }}>⚠️ {storyMediaWarning}</p>}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button onClick={() => pickStoryMedia("photo")} className="rounded-xl py-3 font-bold" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: coral }}><ImageIcon size={17} className="inline mr-1" />Photo</button>
                    <button onClick={() => pickStoryMedia("video")} className="rounded-xl py-3 font-bold" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: green }}><Camera size={17} className="inline mr-1" />Vidéo</button>
                  </div>
                </div>
                <div className="p-6 pt-0 shrink-0">
                  <button onClick={goPreview} disabled={!canContinue} className="w-full rounded-xl py-3 text-white font-bold disabled:opacity-40" style={{ background: coral }}>
                    Aperçu
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 p-6 pb-0 shrink-0">
                  <button onClick={() => setStoryStep("compose")} aria-label="Retour" disabled={storyUploading} className="disabled:opacity-40"><ArrowLeft size={20} color={primary} /></button>
                  <h2 className="text-xl font-black" style={{ color: primary }}>Aperçu</h2>
                </div>
                <div className="p-6">
                  <div
                    className="rounded-2xl overflow-hidden relative flex items-center justify-center text-center p-6"
                    style={{
                      aspectRatio: "9/16",
                      maxHeight: "50vh",
                      background: storyMedia ? "#000" : `linear-gradient(160deg,${previewBg},${navy})`,
                    }}
                  >
                    {storyMedia && (
                      storyMediaKind === "video" ? (
                        <video src={mediaPreviewUrl} controls className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <img src={mediaPreviewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      )
                    )}
                    {storyText.trim() && (
                      <p
                        className="relative z-10 text-white font-bold leading-snug"
                        style={{ fontSize: storyMedia ? 15 : 22, textShadow: storyMedia ? "0 1px 4px rgba(0,0,0,.6)" : "none" }}
                      >
                        {storyText.trim()}
                      </p>
                    )}
                  </div>
                </div>
                {storyMediaError && <p className="text-xs px-6" style={{ color: coral }}>{storyMediaError}</p>}
                {!storyMediaError && storyMediaWarning && <p className="text-xs px-6" style={{ color: "#A5761F" }}>⚠️ {storyMediaWarning}</p>}
                <div className="p-6 pt-2 shrink-0 flex flex-col gap-2">
                  <button onClick={addStory} disabled={storyUploading} className="bb-btn-gold w-full rounded-xl py-3 font-bold disabled:opacity-40">
                    {storyUploading ? (storyMediaKind && storyUploadProgress > 0 ? `Envoi... ${storyUploadProgress}%` : "Publication...") : "Publier"}
                  </button>
                  <button onClick={() => setStoryStep("compose")} disabled={storyUploading} className="w-full rounded-xl py-3 font-semibold disabled:opacity-40" style={{ color: primary, opacity: 0.7 }}>
                    Modifier
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
