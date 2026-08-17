import React from "react";
import { X } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export default function MediaViewerModal({ url, alt, onClose }) {
  useEscapeKey(Boolean(url), onClose);
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(10,13,26,.92)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Photo"}
    >
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,.12)" }}
      >
        <X size={20} color="#fff" />
      </button>
      <img
        src={url}
        alt={alt || ""}
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
