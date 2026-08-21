import React from "react";
import { C, MAX_PHOTOS } from "../../../constants";

export function isStep2Valid(photoPreviews) {
  return photoPreviews.length >= 1;
}

export default function Step2Photo({ photoPreviews, handlePhotosSelected, removePhotoFile }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        Ajoute une photo
      </h2>
      <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
        Utilise une photo claire où l'on peut facilement te reconnaître.
      </p>

      <div className="flex flex-wrap gap-2 mt-1">
        {photoPreviews.map((src, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={src} alt={`Photo ${i + 1}`} style={{ width: 84, height: 84, borderRadius: "var(--bb-radius-sm)", objectFit: "cover", boxShadow: "var(--bb-shadow-sm)" }} />
            {i === 0 && (
              <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: C.ochre, color: C.indigoDeep }}>
                Principale
              </span>
            )}
            <button
              type="button"
              onClick={() => removePhotoFile(i)}
              aria-label="Supprimer cette photo"
              style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: C.indigo, color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ×
            </button>
          </div>
        ))}
        {photoPreviews.length < MAX_PHOTOS && (
          <label className="cursor-pointer flex items-center justify-center transition-colors hover:bg-black/[0.02]" style={{ width: 84, height: 84, borderRadius: "var(--bb-radius-sm)", border: "1.5px dashed rgba(var(--bb-ink-rgb),0.28)" }}>
            <span className="text-xs text-center px-1" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>+ Ajouter</span>
            <input type="file" accept="image/*" multiple onChange={handlePhotosSelected} className="hidden" />
          </label>
        )}
      </div>
      <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>
        Jusqu'à {MAX_PHOTOS} photos. La première est ta photo principale.
      </p>
    </div>
  );
}
