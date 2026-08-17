import React, { useRef, useState } from "react";
import { Paperclip, Camera, Image as ImageIcon, Video, FileText, Smile as StickerIcon, ArrowLeft } from "lucide-react";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import StickerPicker from "./StickerPicker";
import { primary, bg, muted, card } from "./theme";

const OPTIONS = [
  { id: "camera", label: "Photo", icon: Camera, kind: "image", accept: "image/*", capture: "environment" },
  { id: "gallery", label: "Galerie", icon: ImageIcon, kind: "image", accept: "image/*" },
  { id: "video", label: "Vidéo", icon: Video, kind: "video", accept: "video/*" },
  { id: "file", label: "Fichier", icon: FileText, kind: "file", accept: undefined },
];

export default function MessageMediaPicker({ onPickFile, onPickSticker }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("menu"); // "menu" | "stickers"
  const wrapRef = useRef(null);
  const inputRefs = useRef({});

  const close = () => { setOpen(false); setView("menu"); };
  useClickOutside(wrapRef, open, close);
  useEscapeKey(open, close);

  const handleFileChange = (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    close();
    onPickFile(file, kind);
  };

  const handleStickerPick = (sticker) => {
    close();
    onPickSticker(sticker);
  };

  return (
    <div ref={wrapRef} className="relative">
      {OPTIONS.map((opt) => (
        <input
          key={opt.id}
          ref={(el) => (inputRefs.current[opt.id] = el)}
          type="file"
          accept={opt.accept}
          capture={opt.capture}
          className="hidden"
          onChange={(e) => handleFileChange(e, opt.kind)}
        />
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Joindre un média"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2"
        style={{ width: 40, height: 44 }}
      >
        <Paperclip size={20} color={muted} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={view === "stickers" ? "Stickers" : "Ajouter un média"}
          className={`${card} overflow-hidden p-3`}
          style={{ position: "absolute", bottom: 48, left: 0, width: "min(300px, calc(100vw - 32px))", maxWidth: "calc(100vw - 32px)", zIndex: 20 }}
        >
          {view === "menu" ? (
            <div className="grid grid-cols-4 gap-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => inputRefs.current[opt.id]?.click()}
                  className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl hover:bg-black/5"
                  aria-label={opt.label}
                >
                  <div className="h-11 w-11 rounded-full flex items-center justify-center" style={{ background: bg }}>
                    <opt.icon size={18} color={primary} />
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: primary }}>{opt.label}</span>
                </button>
              ))}
              <button type="button" onClick={() => setView("stickers")} className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl hover:bg-black/5" aria-label="Stickers">
                <div className="h-11 w-11 rounded-full flex items-center justify-center" style={{ background: bg }}>
                  <StickerIcon size={18} color={primary} />
                </div>
                <span className="text-[11px] font-semibold" style={{ color: primary }}>Stickers</span>
              </button>
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setView("menu")} aria-label="Retour" className="flex items-center gap-1 text-xs font-bold mb-2" style={{ color: primary }}>
                <ArrowLeft size={14} /> Retour
              </button>
              <StickerPicker onPick={handleStickerPick} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
