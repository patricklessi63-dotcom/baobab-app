import React from "react";
import { Play } from "lucide-react";

// Disposition de galerie partagée entre l'affichage d'une publication
// (PostCard) et l'aperçu dans le composeur (PostComposerModal) — un seul
// layout à maintenir. items = [{url, kind}], overlay optionnel par item
// (ex. barre de progression/bouton supprimer côté composeur).
export default function PostMediaGrid({ items, className = "", itemClassName = "", renderOverlay, onItemClick, maxVisible = 4 }) {
  const count = items.length;
  if (count === 0) return null;

  const visible = items.slice(0, maxVisible);
  const extra = count - maxVisible;

  const gridClass =
    count === 1 ? "grid grid-cols-1" :
    count === 2 ? "grid grid-cols-2 gap-1" :
    count === 3 ? "grid grid-cols-2 gap-1" :
    "grid grid-cols-2 gap-1";

  return (
    <div className={`${gridClass} ${className}`}>
      {visible.map((item, i) => {
        // 3 images : la première prend toute la hauteur à gauche (span-2 lignes).
        const spanClass = count === 3 && i === 0 ? "row-span-2" : "";
        const isLastVisible = i === maxVisible - 1 && extra > 0;
        return (
          <div
            key={item.url || i}
            onClick={() => onItemClick?.(item, i)}
            className={`relative overflow-hidden bg-black/5 ${count === 1 ? "aspect-video" : "aspect-square"} ${spanClass} ${itemClassName}`}
            style={{ cursor: onItemClick ? "pointer" : "default" }}
          >
            {item.kind === "video" ? (
              <>
                <video src={item.url || item.previewUrl} className="w-full h-full object-cover" muted />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play size={count === 1 ? 40 : 24} color="#fff" fill="#fff" />
                </span>
              </>
            ) : (
              <img src={item.url || item.previewUrl} alt="" className="w-full h-full object-cover" />
            )}
            {isLastVisible && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-lg font-black">
                +{extra}
              </span>
            )}
            {renderOverlay?.(item, i)}
          </div>
        );
      })}
    </div>
  );
}
