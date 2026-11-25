import React, { createContext, useCallback, useContext, useState, Suspense, lazy } from "react";
import ChunkErrorBoundary from "../components/ChunkErrorBoundary";

// Visionneuse (≈ 6 ko) : hors du fichier principal, chargée au premier clic sur une photo (déjà montée seulement à l'ouverture).
const MediaViewerModal = lazy(() => import("../components/social/MediaViewerModal"));

// Provider monté une seule fois à la racine (main.jsx) — expose
// openLightbox() à n'importe quel composant profondément imbriqué via le
// hook useImageLightbox(), sans avoir à faire redescendre des props sur
// toute la chaîne. Un seul <MediaViewerModal> réellement monté à la fois :
// pas de visualiseur dupliqué (item 17/24 du cahier des charges).
const ImageLightboxContext = createContext(null);

export function ImageLightboxProvider({ children }) {
  const [state, setState] = useState(null); // { images: [{url,alt}], index }

  const openLightbox = useCallback((images, index = 0) => {
    const list = (Array.isArray(images) ? images : [images]).filter((im) => im?.url);
    if (!list.length) return;
    setState({ images: list, index: Math.min(Math.max(index, 0), list.length - 1) });
  }, []);

  const closeLightbox = useCallback(() => setState(null), []);
  const navigateLightbox = useCallback((i) => setState((s) => (s ? { ...s, index: i } : s)), []);

  return (
    <ImageLightboxContext.Provider value={{ openLightbox }}>
      {children}
      {state && (
        <ChunkErrorBoundary>
          <Suspense fallback={null}>
            <MediaViewerModal
              images={state.images}
              index={state.index}
              onNavigate={navigateLightbox}
              onClose={closeLightbox}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}
    </ImageLightboxContext.Provider>
  );
}

export function useImageLightbox() {
  const ctx = useContext(ImageLightboxContext);
  if (!ctx) throw new Error("useImageLightbox doit être utilisé sous ImageLightboxProvider");
  return ctx;
}

// Variante tolérante : renvoie null hors fournisseur (tests de composants qui ne
// montent pas ImageLightboxProvider). En production le fournisseur est monté à
// la racine (main.jsx), donc le contexte existe toujours.
export function useOptionalImageLightbox() {
  return useContext(ImageLightboxContext);
}
