import React, { useState } from "react";
import { STICKER_CATEGORIES, STICKER_GRADIENTS } from "../../lib/stickerData";
import { primary, muted, primaryRgb } from "./theme";

// Contenu de sélection de stickers — sans chrome de popover ni bouton
// déclencheur propre (contrairement à EmojiPicker) : ce composant est
// destiné à être intégré dans MessageMediaPicker (accessible via 📎), pas
// à occuper son propre bouton sur la barre de saisie.
export default function StickerPicker({ onPick }) {
  const [activeCategory, setActiveCategory] = useState(STICKER_CATEGORIES[0].id);
  const activeCat = STICKER_CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div>
      <div className="flex overflow-x-auto px-1 pb-2 gap-1">
        {STICKER_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            aria-label={cat.label}
            aria-pressed={activeCategory === cat.id}
            className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg text-base focus-visible:outline focus-visible:outline-2"
            style={{ background: activeCategory === cat.id ? `rgba(${primaryRgb},.06)` : "transparent" }}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <div className="text-[10px] font-black uppercase tracking-wider px-1 mb-1.5" style={{ color: primary }}>{activeCat.label}</div>
      <div className="grid grid-cols-3 gap-2 overflow-y-auto" style={{ maxHeight: 220 }}>
        {activeCat.stickers.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            aria-label={s.caption || s.emoji}
            className="rounded-2xl flex flex-col items-center justify-center gap-1 p-3 aspect-square hover:opacity-90 focus-visible:outline focus-visible:outline-2"
            style={{ background: STICKER_GRADIENTS[s.gradient] || STICKER_GRADIENTS.coral }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>{s.emoji}</span>
            {s.caption && <span className="text-[10px] font-bold text-white text-center leading-tight">{s.caption}</span>}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-center mt-2" style={{ color: muted }}>Touche un sticker pour l'envoyer.</p>
    </div>
  );
}
