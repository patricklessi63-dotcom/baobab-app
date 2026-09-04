import React, { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import EmptyState from "../home/EmptyState";
import Skeleton from "../Skeleton";
import { useImageLightbox } from "../../lib/ImageLightboxContext";
import { validateMediaFile } from "../../lib/mediaValidation";
import { compressImageIfNeeded } from "../../lib/imageCompression";
import { extFromMime } from "../../lib/mediaConstants";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import { muted, bg, primaryRgb } from "./theme";

const BUCKET = "event-media";

// Réutilise l'image validation existante (mediaValidation.js, limite
// "image" = 8 Mo) — aucun nouveau kind de média nécessaire, une photo
// d'événement est une image comme une autre côté client.
export default function EventPhotoGallery({ photos = [], loading, canUpload, currentUserId, canModerate, onUpload, onDelete }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const { openLightbox } = useImageLightbox();
  const gallery = photos.filter((p) => p.url).map((p) => ({ url: p.url, alt: "" }));

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    const { ok, error: validationError } = await validateMediaFile(file, "image");
    if (!ok) { setError(validationError); return; }
    setUploading(true);
    try {
      // Bug corrigé à l'audit (croisement exhaustif avec
      // compressImageIfNeeded, déjà utilisé par PostsFeed.jsx) : une photo
      // ajoutée à la galerie d'un événement partait toujours en taille
      // originale, jamais compressée comme les autres images de l'app.
      const finalFile = await compressImageIfNeeded(file);
      const path = `${onUpload.eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromMime(finalFile.type)}`;
      await uploadWithProgress({ bucket: BUCKET, path, file: finalFile });
      await onUpload.save(path);
    } catch (e2) {
      console.error(e2);
      setError("Impossible de partager cette photo. Réessaie.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {canUpload && (
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-full disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: bg }}
          >
            <ImagePlus size={15} /> {uploading ? "Envoi..." : "Ajouter une photo"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
        </div>
      )}
      {error && <p className="text-xs mb-3" style={{ color: "#E56B5D" }}>{error}</p>}

      {loading ? (
        <Skeleton rows={2} height={80} />
      ) : photos.length === 0 ? (
        <EmptyState icon={ImagePlus} title="Aucune photo pour l'instant." subtitle="Les participants pourront partager des souvenirs ici." />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden group" style={{ background: bg }}>
              {p.url ? (
                // Bug corrigé à l'audit accessibilité : <img onClick> nu, jamais
                // focusable ni activable au clavier (même famille que
                // ClickableImage.jsx/PostMediaGrid.jsx) — un utilisateur
                // clavier-seul ne pouvait pas ouvrir une photo d'événement en
                // plein écran.
                <img
                  src={p.url}
                  alt=""
                  onClick={() => openLightbox(gallery, gallery.findIndex((g) => g.url === p.url))}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(gallery, gallery.findIndex((g) => g.url === p.url)); } }}
                  tabIndex={0}
                  role="button"
                  aria-label="Agrandir la photo"
                  className="w-full h-full object-cover cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              ) : null}
              {(p.uploaded_by === currentUserId || canModerate) && (
                <button
                  onClick={() => { if (window.confirm("Supprimer cette photo ? Cette action est irréversible.")) onDelete(p); }}
                  aria-label="Supprimer cette photo"
                  className="absolute top-1 right-1 h-7 w-7 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2"
                  style={{ background: `rgba(${primaryRgb},.6)` }}
                >
                  <Trash2 size={13} color="#fff" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] mt-2" style={{ color: muted }}>{photos.length} photo{photos.length > 1 ? "s" : ""}</p>
    </div>
  );
}
