import React from "react";
import { Reply, Copy, Trash2 } from "lucide-react";
import { primary, coral, muted, card, primaryRgb } from "./theme";

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🎉"];

export default function MessageActionsMenu({ message, isMine, align, onReact, onReply, onCopy, onDeleteForMe, onDeleteForEveryone, onClose }) {
  return (
    <div
      role="menu"
      className={`${card} overflow-hidden`}
      style={{ position: "absolute", top: "100%", marginTop: 4, [align]: 0, minWidth: 190, zIndex: 15 }}
    >
      <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)` }}>
        {QUICK_REACTIONS.map((emoji) => (
          <button key={emoji} type="button" onClick={() => { onReact(emoji); onClose(); }} className="text-lg hover:scale-125 motion-safe:transition-transform" aria-label={`Réagir avec ${emoji}`}>
            {emoji}
          </button>
        ))}
      </div>
      <button role="menuitem" onClick={() => { onReply(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary }}>
        <Reply size={14} /> Répondre
      </button>
      {message.kind === "text" && (
        <button role="menuitem" onClick={() => { onCopy(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <Copy size={14} /> Copier
        </button>
      )}
      <button role="menuitem" onClick={() => { onDeleteForMe(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: muted, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
        <Trash2 size={14} /> Supprimer pour moi
      </button>
      {isMine && (
        <button role="menuitem" onClick={() => { onDeleteForEveryone(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: coral, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <Trash2 size={14} /> Supprimer pour tout le monde
        </button>
      )}
    </div>
  );
}
