import React from "react";
import { X, Image as ImageIcon, Camera } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, green, coral, bg } from "./theme";

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
  storyUploading,
  pickStoryMedia,
  onStoryMediaSelected,
  storyPhotoInputRef,
  storyVideoInputRef,
  addStory,
}) {
  useEscapeKey(storyComposer, () => setStoryComposer(false));
  return (
    <>
      <input ref={storyPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onStoryMediaSelected(e, "photo")} />
      <input ref={storyVideoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onStoryMediaSelected(e, "video")} />
      {storyComposer && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(5px)" }} onClick={() => setStoryComposer(false)} role="dialog" aria-modal="true" aria-label="Nouveau statut">
          <div className="bg-white w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-xl font-black" style={{ color: primary }}>Nouveau statut</h2><button onClick={() => setStoryComposer(false)} aria-label="Fermer"><X /></button></div>
            <textarea autoFocus value={storyText} onChange={(e) => setStoryText(e.target.value)} className="mt-5 w-full min-h-28 rounded-2xl p-4 outline-none resize-none" style={{ background: bg }} placeholder="Une pensée, une bonne nouvelle, un moment de ta journée…" />
            {storyMedia && (
              <div className="mt-3 rounded-2xl overflow-hidden bg-black max-h-56 relative">
                {storyMediaKind === "video" ? (
                  <video src={URL.createObjectURL(storyMedia)} controls className="w-full max-h-56 object-contain" />
                ) : (
                  <img src={URL.createObjectURL(storyMedia)} alt="" className="w-full max-h-56 object-contain" />
                )}
                <button onClick={() => { setStoryMedia(null); setStoryMediaKind(""); }} aria-label="Retirer le média" className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <X size={14} />
                </button>
              </div>
            )}
            {storyMediaError && <p className="text-xs mt-2" style={{ color: coral }}>{storyMediaError}</p>}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => pickStoryMedia("photo")} className="rounded-xl py-3 font-bold" style={{ background: "#FFF3F1", color: coral }}><ImageIcon size={17} className="inline mr-1" />Photo</button>
              <button onClick={() => pickStoryMedia("video")} className="rounded-xl py-3 font-bold" style={{ background: "#EEF8F4", color: green }}><Camera size={17} className="inline mr-1" />Vidéo</button>
            </div>
            <button onClick={addStory} disabled={(!storyText.trim() && !storyMedia) || storyUploading} className="w-full mt-4 rounded-xl py-3 text-white font-bold disabled:opacity-40" style={{ background: coral }}>
              {storyUploading ? "Publication..." : "Partager le statut"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
