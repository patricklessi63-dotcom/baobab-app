import React from "react";
import { Reply, Copy, Trash2, Flag, Forward, CheckSquare } from "lucide-react";
import { primary, coralText, muted, card, primaryRgb } from "./theme";

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🎉"];

// canDeleteForEveryone : calculé par l'appelant (auteur ET délai de suppression non expiré, voir
// lib/messageDeletion.js) ; par défaut `isMine` pour les appelants qui ne le fournissent pas.
export default function MessageActionsMenu({ message, isMine, canDeleteForEveryone = isMine, align, onReact, onReply, onCopy, onForward, onSelect, onReport, onDeleteForMe, onDeleteForEveryone, onClose }) {
  return (
    <div
      role="menu"
      className={`${card} overflow-hidden`}
      style={{ position: "absolute", top: "100%", marginTop: 4, [align]: 0, minWidth: 190, zIndex: 15 }}
    >
      <div className="flex items-center justify-between px-1" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)` }}>
        {QUICK_REACTIONS.map((emoji) => (
          <button key={emoji} type="button" onClick={() => { onReact(emoji); onClose(); }} className="text-lg min-w-[40px] min-h-[44px] flex items-center justify-center hover:scale-125 motion-safe:transition-transform" aria-label={`Réagir avec ${emoji}`}>
            {emoji}
          </button>
        ))}
      </div>
      {/* onReply omis (plutôt que Boolean) par ConversationPane.jsx quand
      l'autre personne de la conversation n'est plus disponible (banni/
      suspendu) : répondre configurerait un bandeau "Réponse à..." au-dessus
      d'une barre de saisie elle-même masquée dans ce cas (voir otherUnavailable
      dans ConversationPane.jsx) — un clic qui ne mènerait jamais nulle part. */}
      {onReply && (
        <button role="menuitem" onClick={() => { onReply(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary }}>
          <Reply size={14} /> Répondre
        </button>
      )}
      {message.kind === "text" && (
        <button role="menuitem" onClick={() => { onCopy(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <Copy size={14} /> Copier
        </button>
      )}
      {onForward && message.kind !== "event" && (
        <button role="menuitem" onClick={() => { onForward(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <Forward size={14} /> Transférer
        </button>
      )}
      {onSelect && (
        <button role="menuitem" onClick={() => { onSelect(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <CheckSquare size={14} /> Sélectionner
        </button>
      )}
      {/* Signalement d'un message précis (Apple 1.2 / Google Play UGC : un moyen de
          signaler le contenu lui-même, pas seulement la personne). Seulement pour
          les messages REÇUS : on ne signale pas son propre message. Le signalement
          réutilise celui du profil (ReportModal + table reports), puis propose le
          blocage — voir ConversationPane.jsx. */}
      {onReport && !isMine && (
        <button role="menuitem" onClick={() => { onReport(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <Flag size={14} /> Signaler ce message
        </button>
      )}
      <button role="menuitem" onClick={() => { onDeleteForMe(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: muted, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
        <Trash2 size={14} /> Supprimer pour moi
      </button>
      {canDeleteForEveryone && (
        <button role="menuitem" onClick={() => { onDeleteForEveryone(); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: coralText, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <Trash2 size={14} /> Supprimer pour tout le monde
        </button>
      )}
    </div>
  );
}
