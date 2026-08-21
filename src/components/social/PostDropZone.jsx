import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { primary, primaryRgb } from "./theme";

// Même motif que ChatDropZone.jsx (compteur de survol imbriqué, desktop
// uniquement) mais accepte plusieurs fichiers à la fois — le composeur de
// publication permet une galerie, contrairement à un message qui n'attache
// qu'un seul fichier.
export default function PostDropZone({ onDropFiles, children }) {
  const [dragActive, setDragActive] = useState(false);
  const counterRef = useRef(0);

  const handleDragEnter = (e) => {
    e.preventDefault();
    if (!e.dataTransfer?.types?.includes("Files")) return;
    counterRef.current += 1;
    setDragActive(true);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    counterRef.current = Math.max(0, counterRef.current - 1);
    if (counterRef.current === 0) setDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    counterRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) onDropFiles(files);
  };

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {dragActive && (
        <div
          className="hidden md:flex absolute inset-2 rounded-2xl flex-col items-center justify-center gap-2 pointer-events-none z-10"
          style={{ background: `rgba(${primaryRgb},.06)`, border: `2px dashed ${primary}` }}
        >
          <Upload size={28} color={primary} />
          <span className="text-sm font-bold" style={{ color: primary }}>Dépose tes photos ou vidéos ici</span>
        </div>
      )}
    </div>
  );
}
