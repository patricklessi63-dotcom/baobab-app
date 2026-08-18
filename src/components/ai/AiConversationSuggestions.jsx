import React, { useState, useRef } from "react";
import { Sparkles } from "lucide-react";
import { coral, muted, bg, goldText } from "../social/theme";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";

// "✨ Suggestions" — assistant de conversation à la demande (item 16).
// L'Edge Function "ai-assist" n'est pas encore déployée/configurée (clé
// Anthropic à venir) — le bouton reste visible mais affiche un message
// "Bientôt disponible" au lieu d'appeler un backend qui échouerait, plutôt
// que de masquer la fonctionnalité ou de laisser une erreur réseau confuse.
export default function AiConversationSuggestions() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, open, () => setOpen(false));
  useEscapeKey(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Suggestions IA pour la conversation"
        aria-expanded={open}
        className="h-11 w-11 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2"
        style={{ background: bg, color: coral }}
      >
        <Sparkles size={17} />
      </button>
      {open && (
        <div className="absolute bottom-14 left-0 w-72 bg-white rounded-2xl border shadow-2xl p-3 z-20">
          <div className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1 mb-2" style={{ color: goldText }}>
            <Sparkles size={11} /> Suggestions IA
          </div>
          <p className="text-xs" style={{ color: muted }}>Bientôt disponible ✨</p>
        </div>
      )}
    </div>
  );
}
