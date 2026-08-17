import React from "react";
import { X, Image as ImageIcon, Camera } from "lucide-react";
import Avatar from "../Avatar";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, green, coral, bg, muted } from "./theme";

export default function PostComposerModal({
  composer,
  setComposer,
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
}) {
  useEscapeKey(composer, () => setComposer(false));
  return (
    <>
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onMediaSelected(e, "photo")} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onMediaSelected(e, "video")} />
      {composer && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(5px)" }} onClick={() => setComposer(false)} role="dialog" aria-modal="true" aria-label="Créer une publication">
          <div className="bg-white w-full max-w-xl rounded-t-[30px] md:rounded-[30px] p-5 md:p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div><h2 className="text-xl font-black" style={{ color: primary }}>Créer une publication</h2><p className="text-xs mt-1" style={{ color: muted }}>Partage quelque chose d'utile, drôle ou inspirant.</p></div>
              <button onClick={() => setComposer(false)} aria-label="Fermer" className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: bg }}><X size={18} /></button>
            </div>
            <div className="flex gap-3 mt-5">
              <Avatar name={currentUser?.name || "Toi"} url={currentUser?.avatar_url} size={40} />
              <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1 min-h-32 rounded-2xl p-4 outline-none resize-none" style={{ background: bg }} placeholder="Écris ton message..." />
            </div>
            {composerMedia && <div className="mt-3 rounded-2xl overflow-hidden bg-black max-h-56">{composerMediaKind === "video" ? <video src={URL.createObjectURL(composerMedia)} controls className="w-full max-h-56 object-contain" /> : <img src={URL.createObjectURL(composerMedia)} alt="" className="w-full max-h-56 object-contain" />}</div>}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => pickMedia("photo")} className="rounded-xl py-3 font-bold" style={{ background: "#FFF3F1", color: coral }}><ImageIcon size={17} className="inline mr-1" />Ajouter une photo</button>
              <button onClick={() => pickMedia("video")} className="rounded-xl py-3 font-bold" style={{ background: "#EEF8F4", color: green }}><Camera size={17} className="inline mr-1" />Ajouter une vidéo</button>
            </div>
            <button onClick={publish} disabled={!draft.trim() && !composerMedia} className="w-full mt-4 rounded-xl py-3.5 text-white font-bold disabled:opacity-40" style={{ background: primary }}>Publier sur Baobab</button>
          </div>
        </div>
      )}
    </>
  );
}
