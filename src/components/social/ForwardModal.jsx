import React, { useMemo, useRef, useState } from "react";
import { Search, X, Send, Loader2 } from "lucide-react";
import Avatar from "../Avatar";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { normalizeForSearch } from "../../lib/searchQuery";
import { primary, muted, card, bg, primaryRgb } from "./theme";

// Choix de la conversation de destination d'un transfert de message(s).
// Ne liste que les conversations où l'on peut réellement écrire : l'autre
// personne bannie ou suspendue est écartée (la policy RLS d'INSERT sur
// "messages" refuserait l'envoi de toute façon).
export default function ForwardModal({ open, matches = [], excludeId, count = 1, onClose, onPick }) {
  const [query, setQuery] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const dialogRef = useRef(null);
  useEscapeKey(Boolean(open) && sendingId == null, onClose);
  useFocusTrap(Boolean(open), dialogRef);

  const targets = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    return matches
      .filter((m) => m.id !== excludeId)
      .filter((m) => !m.banned_at && !(m.suspended_until && new Date(m.suspended_until) > new Date()))
      .filter((m) => !q || normalizeForSearch(m.name || "").includes(q));
  }, [matches, query, excludeId]);

  if (!open) return null;

  const pick = async (match) => {
    if (sendingId != null) return;
    setSendingId(match.id);
    try {
      await onPick(match);
    } finally {
      setSendingId(null);
    }
  };

  const title = count > 1 ? `Transférer ${count} messages à…` : "Transférer le message à…";

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center sm:p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(4px)" }}
      onClick={sendingId != null ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`${card} w-full sm:max-w-sm flex flex-col`}
        style={{ maxHeight: "80dvh", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <h2 className="text-base font-black" style={{ color: primary }}>{title}</h2>
          <button onClick={onClose} disabled={sendingId != null} aria-label="Fermer" className="bb-hit h-9 w-9 flex items-center justify-center rounded-full disabled:opacity-50">
            <X size={18} color={muted} />
          </button>
        </div>
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: bg }}>
          <Search size={15} color={muted} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une conversation..."
            aria-label="Rechercher une conversation"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: primary, fontSize: 16 }}
          />
        </div>
        <div className="overflow-y-auto px-2 pb-3" role="list">
          {targets.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: muted }}>
              {query ? "Aucune conversation ne correspond." : "Aucune conversation disponible."}
            </p>
          )}
          {targets.map((m) => (
            <button
              key={m.id}
              role="listitem"
              type="button"
              onClick={() => pick(m)}
              disabled={sendingId != null}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-[var(--bb-surface-2)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2"
              aria-label={`Transférer à ${m.name}`}
            >
              <Avatar name={m.name} url={m.avatar_url} size={40} />
              <span className="flex-1 min-w-0 text-sm font-bold truncate" style={{ color: primary }}>{m.name}</span>
              {sendingId === m.id ? <Loader2 size={16} className="animate-spin" color={muted} /> : <Send size={15} color={muted} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
