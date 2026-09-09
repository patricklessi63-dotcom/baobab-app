import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Video, X, Upload } from "lucide-react";
import Avatar from "../Avatar";
import { validateMediaFile } from "../../lib/mediaValidation";
import { muted, bg, primary, primaryRgb } from "./theme";

const MAX_LENGTH = 4000; // miroir de la contrainte community_posts.body

export default function CommunityPostComposer({ currentUser, draft, setDraft, onSubmit, submitting, onError = () => {} }) {
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaKind, setMediaKind] = useState("");
  const [mediaPreview, setMediaPreview] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const applyMediaFile = async (file, kind) => {
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

  const onMediaSelected = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    await applyMediaFile(file, kind);
  };

  // Le glisser-déposer existait déjà pour la messagerie (ChatDropZone) et le
  // fil principal (PostDropZone), mais pas ici : composeur quasi identique
  // (texte + une photo/vidéo), incohérence non documentée. Repris en local
  // (plutôt que PostDropZone, prévu pour un conteneur flex en plein écran)
  // car ce composeur s'insère dans une simple carte de page, pas un modal.
  const handleDragEnter = (e) => {
    e.preventDefault();
    if (!e.dataTransfer?.types?.includes("Files")) return;
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    applyMediaFile(file, file.type?.startsWith("video/") ? "video" : "image");
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
      <div
        className="relative flex-1"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragActive && (
          <div
            className="hidden md:flex absolute inset-0 rounded-2xl flex-col items-center justify-center gap-2 pointer-events-none z-10"
            style={{ background: `rgba(${primaryRgb},.06)`, border: `2px dashed ${primary}` }}
          >
            <Upload size={24} color={primary} />
            <span className="text-sm font-bold" style={{ color: primary }}>Dépose ta photo ou vidéo ici</span>
          </div>
        )}
        <textarea
          dir="auto"
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
