import React from "react";
import { useImageLightbox } from "../lib/ImageLightboxContext";

// Remplaçant direct de <img> pour toute image destinée à être consultée
// (photo de profil, publication, statut, actualité...) — ouvre le
// visualiseur global au clic. `gallery` (optionnel) est un tableau
// [{url, alt}] pour naviguer entre plusieurs images du même contenu ;
// `galleryIndex` indique la position de cette image dans ce tableau.
// Purement décoratif ? Ne pas utiliser ce composant — restez sur <img>.
//
// Bug corrigé à l'audit accessibilité : un <img onClick> nu n'est jamais
// focusable ni activable au clavier — sur les 3 usages de ce composant
// (PostCard, CommunityPostCard, PublicProfileModal), un utilisateur
// clavier-seul ne pouvait tout simplement pas ouvrir le visualiseur plein
// écran depuis une publication ou une galerie de profil, alors qu'un
// utilisateur souris le pouvait partout. tabIndex/role="button"/onKeyDown
// (Entrée/Espace) + anneau de focus en font un vrai contrôle clavier, sans
// changer son comportement au clic ni son rendu visuel par défaut.
export default function ClickableImage({ src, alt = "", gallery, galleryIndex = 0, className, style, onClick, onKeyDown, "aria-label": ariaLabel, ...rest }) {
  const { openLightbox } = useImageLightbox();

  const handleClick = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const images = gallery && gallery.length > 0 ? gallery : [{ url: src, alt }];
    const idx = gallery && gallery.length > 0 ? galleryIndex : 0;
    openLightbox(images, idx);
  };

  const handleKeyDown = (e) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <img
      src={src}
      alt={alt}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel || "Agrandir l'image"}
      className={`${className || ""} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
      style={style}
      {...rest}
    />
  );
}
