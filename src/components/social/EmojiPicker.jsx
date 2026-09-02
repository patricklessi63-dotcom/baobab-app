import React, { useEffect, useRef, useState } from "react";
import { Smile, Search, X } from "lucide-react";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { EMOJI_CATEGORIES, searchEmojis } from "../../lib/emojiData";
import { primary, bg, muted, card, primaryRgb } from "./theme";

const RECENTS_MAX = 24;

function recentsKey(userId) {
  return `baobab:recentEmoji:${userId || "anon"}`;
}

function loadRecents(userId) {
  try {
    const raw = localStorage.getItem(recentsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // JSON.parse réussit sur n'importe quelle valeur JSON valide (objet,
    // nombre, chaîne...), pas seulement un tableau : sans ce filtrage, une
    // entrée corrompue (édition manuelle du stockage, extension navigateur,
    // ancien format) atterrissait telle quelle dans le state React, et
    // `recents.map(...)` plus bas plantait tout le rendu du sélecteur
    // d'emojis (même famille que le brouillon de publication non revalidé).
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => typeof e === "string" && e.length > 0).slice(0, RECENTS_MAX);
  } catch (_) {
    return [];
  }
}

function saveRecent(userId, emoji) {
  try {
    const next = [emoji, ...loadRecents(userId).filter((e) => e !== emoji)].slice(0, RECENTS_MAX);
    localStorage.setItem(recentsKey(userId), JSON.stringify(next));
    return next;
  } catch (_) {
    return [];
  }
}

export default function EmojiPicker({ onPick, currentUserId }) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState([]);
  const wrapRef = useRef(null);

  useClickOutside(wrapRef, open, () => setOpen(false));
  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    if (open) setRecents(loadRecents(currentUserId));
  }, [open, currentUserId]);

  const handlePick = (emoji) => {
    onPick(emoji);
    setRecents(saveRecent(currentUserId, emoji));
  };

  const results = query.trim() ? searchEmojis(query) : null;
  const activeCat = EMOJI_CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Emojis"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2"
        style={{ width: 40, height: 44 }}
      >
        <Smile size={20} color={muted} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sélecteur d'emojis"
          className={`${card} overflow-hidden`}
          style={{ position: "absolute", bottom: 48, left: 0, width: "min(320px, calc(100vw - 32px))", maxWidth: "calc(100vw - 32px)", zIndex: 20 }}
        >
          <div className="p-2.5" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)` }}>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: bg }}>
              <Search size={14} color={muted} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un emoji..."
                aria-label="Rechercher un emoji"
                className="flex-1 bg-transparent text-sm outline-none min-w-0"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche">
                  <X size={14} color={muted} />
                </button>
              )}
            </div>
          </div>

          {!query && (
            <div className="flex overflow-x-auto px-2 pt-2 gap-1" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)` }}>
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  aria-label={cat.label}
                  aria-pressed={activeCategory === cat.id}
                  className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg text-base"
                  style={{ background: activeCategory === cat.id ? bg : "transparent" }}
                >
                  {cat.icon}
                </button>
              ))}
            </div>
          )}

          <div className="p-2 overflow-y-auto" style={{ maxHeight: 240 }}>
            {query ? (
              results && results.length > 0 ? (
                <div className="grid grid-cols-7 gap-1">
                  {results.map((item, i) => (
                    <button key={`${item.e}-${i}`} type="button" onClick={() => handlePick(item.e)} className="h-9 w-9 flex items-center justify-center rounded-lg text-xl hover:bg-black/5" aria-label={item.k[0]}>
                      {item.e}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-6" style={{ color: muted }}>Aucun résultat.</p>
              )
            ) : (
              <>
                {recents.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-black uppercase tracking-wider px-1 mb-1" style={{ color: muted }}>Récents</div>
                    <div className="grid grid-cols-7 gap-1">
                      {recents.map((e, i) => (
                        <button key={`recent-${e}-${i}`} type="button" onClick={() => handlePick(e)} className="h-9 w-9 flex items-center justify-center rounded-lg text-xl hover:bg-black/5">
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[10px] font-black uppercase tracking-wider px-1 mb-1" style={{ color: primary }}>{activeCat.label}</div>
                <div className="grid grid-cols-7 gap-1">
                  {activeCat.emojis.map((item, i) => (
                    <button key={`${item.e}-${i}`} type="button" onClick={() => handlePick(item.e)} className="h-9 w-9 flex items-center justify-center rounded-lg text-xl hover:bg-black/5" aria-label={item.k[0]}>
                      {item.e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
