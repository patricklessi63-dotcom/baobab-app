import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Video, X } from "lucide-react";
import Avatar from "../Avatar";
import { validateMediaFile } from "../../lib/mediaValidation";
import { muted, bg, primaryRgb } from "./theme";

const MAX_LENGTH = 4000; // miroir de la contrainte community_posts.body

export default function CommunityPostComposer({ currentUser, draft, setDraft, onSubmit, submitting, onError = () => {} }) {
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaKind, setMediaKind] = useState("");
  const [mediaPreview, setMediaPreview] = useState("");
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const onMediaSelected = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { ok, error } = await validateMediaFile(file, kind === "image" ? "image" : "video");
    // Sans ce retour, un fichier invalide (trop lourd, mauvais format) ne
    // donnait strictement aucun retour à l'utilisateur : le sélecteur se
    // fermait et rien ne se passait, comme si le clic n'avait rien fait.
    if (!ok) { onError(error); return; }
    setMediaFile(file);
    setMediaKind(kind);
    setMediaPreview(URL.createObjectURL(file));
  };

  // Révoque l'URL blob de l'aperçu à chaque remplacement et au démontage —
  // sans ça, chaque photo/vidéo sélectionnée fuyait en mémoire (jamais
  // révoquée), même après publication ou annulation.
  useEffect(() => {
    return () => {
      if (mediaPreview) {
        try { URL.revokeObjectURL(mediaPreview); } catch (_) {}
      }
    };
  }, [mediaPreview]);

  const clearMedia = () => {
    setMediaFile(null);
    setMediaKind("");
    setMediaPreview("");
  };

  const handleSubmit = async () => {
    // On n'efface le média que si la publication a réussi : onSubmit
    // retourne false en cas d'échec (validation, upload ou insertion), et
    // avant ce correctif le média était vidé inconditionnellement dès le
    // clic — une publication échouée faisait perdre la photo/vidéo
    // choisie, obligeant à la resélectionner pour réessayer.
    const ok = await onSubmit(mediaFile, mediaKind);
    if (ok) clearMedia();
  };

  const canSubmit = !submitting && (draft.trim() || mediaFile);

  return (
    <div className="flex gap-3">
      <Avatar name={currentUser?.name} url={currentUser?.avatar_url} size={38} />
      <div className="flex-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Qui va au match samedi ?"
          aria-label="Écrire une publication"
          rows={2}
          className="w-full text-sm rounded-2xl px-4 py-3 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)] resize-none"
          style={{ background: bg }}
        />

        {mediaPreview && (
          <div className="relative mt-2 rounded-xl overflow-hidden" style={{ maxHeight: 200, width: "fit-content" }}>
            {mediaKind === "video" ? (
              <video src={mediaPreview} className="max-h-[200px]" controls />
            ) : (
              <img src={mediaPreview} alt="" className="max-h-[200px]" />
            )}
            <button onClick={clearMedia} aria-label="Retirer le média" className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center" style={{ background: `rgba(${primaryRgb},.6)` }}>
              <X size={13} color="#fff" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            <button onClick={() => photoInputRef.current?.click()} aria-label="Ajouter une photo" className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: bg }}>
              <ImagePlus size={14} color={muted} />
            </button>
            <button onClick={() => videoInputRef.current?.click()} aria-label="Ajouter une vidéo" className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: bg }}>
              <Video size={14} color={muted} />
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onMediaSelected(e, "image")} />
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onMediaSelected(e, "video")} />
            <span className="text-[11px] ml-1" style={{ color: muted }}>{draft.length}/{MAX_LENGTH}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bb-btn-gold text-xs font-bold px-4 py-2 rounded-full disabled:opacity-40"
          >
            {submitting ? "Publication..." : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}
