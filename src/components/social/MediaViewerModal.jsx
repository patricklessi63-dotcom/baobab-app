import React, { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 300;
const SWIPE_THRESHOLD = 60;

function dist(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

// Visualiseur d'image centralisé — utilisé par toute l'app via
// ImageLightboxContext.jsx (galerie, zoom, pan) et directement par
// MessageBubbleMedia.jsx (mode simple, un seul "url") pour ne jamais avoir
// deux visualiseurs différents qui divergent.
export default function MediaViewerModal({ images, index = 0, onNavigate, url, alt, onClose }) {
  const list = images || (url ? [{ url, alt }] : []);
  const active = list[index] || list[0];

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imgError, setImgError] = useState(false);
  const dragRef = useRef(null); // { startX, startY, panX, panY }
  const touchRef = useRef(null); // { x, y } single-touch swipe start
  const pinchRef = useRef(null); // { dist, zoom } pinch baseline
  const lastTapRef = useRef(0);

  useEscapeKey(Boolean(active), onClose);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setImgError(false);
  }, [index, url]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX_ZOOM, z + 0.5));
      else if (e.key === "-") setZoom((z) => Math.max(MIN_ZOOM, z - 0.5));
      else if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, list.length]);

  if (!active) return null;

  const canPrev = index > 0;
  const canNext = index < list.length - 1;
  const goPrev = () => { if (canPrev) onNavigate?.(index - 1); };
  const goNext = () => { if (canNext) onNavigate?.(index + 1); };

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.5).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.5).toFixed(2)));
  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const toggleZoom = () => (zoom > 1 ? resetZoom() : setZoom(2.5));

  // Un clic dans le vide (en dehors de l'image elle-même) réinitialise le
  // zoom s'il y en a un en cours, sinon ferme le visualiseur — évite de
  // fermer accidentellement toute la visionneuse quand on voulait juste
  // dézoomer.
  const handleBackgroundClick = () => {
    if (zoom > 1) { resetZoom(); return; }
    onClose();
  };

  // Souris : molette = zoom, glisser = pan (seulement si zoomé), double-clic = toggle zoom
  const onWheel = (e) => {
    e.preventDefault();
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z - e.deltaY * 0.0015).toFixed(2))));
  };
  const onMouseDown = (e) => {
    if (zoom <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) });
  };
  const onMouseUp = () => { dragRef.current = null; };

  // Tactile : un doigt = swipe (galerie/fermeture) si non zoomé, sinon pan ;
  // deux doigts = pincer pour zoomer ; double-tap = toggle zoom.
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: dist(e.touches[0], e.touches[1]), zoom };
      touchRef.current = null;
      return;
    }
    const t = e.touches[0];
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) { toggleZoom(); lastTapRef.current = 0; return; }
    lastTapRef.current = now;
    if (zoom > 1) dragRef.current = { startX: t.clientX, startY: t.clientY, panX: pan.x, panY: pan.y };
    else touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = dist(e.touches[0], e.touches[1]) / (pinchRef.current.dist || 1);
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(pinchRef.current.zoom * ratio).toFixed(2))));
      return;
    }
    if (dragRef.current) {
      const t = e.touches[0];
      const d = dragRef.current;
      setPan({ x: d.panX + (t.clientX - d.startX), y: d.panY + (t.clientY - d.startY) });
    }
  };
  const onTouchEnd = (e) => {
    pinchRef.current = null;
    dragRef.current = null;
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.abs(dy) > Math.abs(dx) && dy > SWIPE_THRESHOLD) { handleBackgroundClick(); return; }
    if (Math.abs(dx) > SWIPE_THRESHOLD) { if (dx < 0) goNext(); else goPrev(); }
  };

  return (
    <div
      className="bb-fade-in fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(10,13,26,.92)" }}
      onClick={handleBackgroundClick}
      onWheel={onWheel}
      role="dialog"
      aria-modal="true"
      aria-label={active.alt || "Photo"}
    >
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Fermer l'image" className="absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 z-10" style={{ background: "rgba(255,255,255,.12)" }}>
        <X size={20} color="#fff" />
      </button>

      {list.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={!canPrev} aria-label="Image précédente" className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 disabled:opacity-30 z-10" style={{ background: "rgba(255,255,255,.12)" }}>
            <ChevronLeft size={22} color="#fff" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); goNext(); }} disabled={!canNext} aria-label="Image suivante" className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 disabled:opacity-30 z-10" style={{ background: "rgba(255,255,255,.12)" }}>
            <ChevronRight size={22} color="#fff" />
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs font-bold text-white px-3 py-1 rounded-full z-10" style={{ background: "rgba(255,255,255,.12)" }}>
            {index + 1} / {list.length}
          </div>
        </>
      )}

      <div
        className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden touch-none"
        style={{ width: "100%", height: "100%" }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleBackgroundClick}
      >
        {imgError ? (
          <p className="text-white/70 text-sm">Image indisponible.</p>
        ) : (
          <img
            key={active.url}
            src={active.url}
            alt={active.alt || ""}
            onError={() => setImgError(true)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={toggleZoom}
            onMouseDown={onMouseDown}
            draggable={false}
            className="bb-fade-in max-w-full max-h-full object-contain rounded-lg select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              cursor: zoom > 1 ? "grab" : "zoom-in",
              transition: dragRef.current ? "none" : "transform .15s ease",
            }}
          />
        )}
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} aria-label="Zoom arrière" disabled={zoom <= MIN_ZOOM} className="h-9 w-9 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 disabled:opacity-30" style={{ background: "rgba(255,255,255,.12)" }}>
          <ZoomOut size={16} color="#fff" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); resetZoom(); }} aria-label="Réinitialiser le zoom" disabled={zoom === 1 && pan.x === 0 && pan.y === 0} className="h-9 w-9 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 disabled:opacity-30" style={{ background: "rgba(255,255,255,.12)" }}>
          <RotateCcw size={15} color="#fff" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} aria-label="Zoom avant" disabled={zoom >= MAX_ZOOM} className="h-9 w-9 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 disabled:opacity-30" style={{ background: "rgba(255,255,255,.12)" }}>
          <ZoomIn size={16} color="#fff" />
        </button>
      </div>
    </div>
  );
}
