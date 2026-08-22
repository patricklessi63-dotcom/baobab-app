import React from "react";
import { useImageLightbox } from "../lib/ImageLightboxContext";

// Remplaçant direct de <img> pour toute image destinée à être consultée
// (photo de profil, publication, statut, actualité...) — ouvre le
// visualiseur global au clic. `gallery` (optionnel) est un tableau
// [{url, alt}] pour naviguer entre plusieurs images du même contenu ;
// `galleryIndex` indique la position de cette image dans ce tableau.
// Purement décoratif ? Ne pas utiliser ce composant — restez sur <img>.
export default function ClickableImage({ src, alt = "", gallery, galleryIndex = 0, className, style, onClick, ...rest }) {
  const { openLightbox } = useImageLightbox();

  const handleClick = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const images = gallery && gallery.length > 0 ? gallery : [{ url: src, alt }];
    const idx = gallery && gallery.length > 0 ? galleryIndex : 0;
    openLightbox(images, idx);
  };

  return (
    <img
      src={src}
      alt={alt}
      onClick={handleClick}
      className={`${className || ""} cursor-pointer`}
      style={style}
      {...rest}
    />
  );
}
