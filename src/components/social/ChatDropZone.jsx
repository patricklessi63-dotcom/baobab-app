import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { primary } from "./theme";

// Enveloppe le conteneur de liste de messages avec un glisser-déposer
// desktop uniquement. Compteur de survol imbriqué pour éviter le
// scintillement classique (dragleave se déclenche en passant d'un enfant à
// un autre). N'affecte jamais la saisie clavier ni le défilement normal —
// les écouteurs sont scopés à ce wrapper, jamais à document.
export default function ChatDropZone({ onDropFile, children }) {
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
    const file = e.dataTransfer?.files?.[0];
    if (file) onDropFile(file);
  };

  return (
    <div
      className="relative flex-1 flex flex-col min-h-0"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {dragActive && (
        <div
          className="hidden md:flex absolute inset-2 rounded-2xl flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ background: "rgba(21,27,61,.06)", border: `2px dashed ${primary}` }}
        >
          <Upload size={28} color={primary} />
          <span className="text-sm font-bold" style={{ color: primary }}>Dépose ton fichier ici</span>
        </div>
      )}
    </div>
  );
}
