import React, { useEffect, useRef, useState } from "react";
import Avatar from "../Avatar";
import { findActiveMention, applyMention, addMention, prunedMentions } from "../../lib/mentions";
import { bg, primary, muted } from "./theme";

// Champ de saisie avec suggestions « @Nom ». La personne n'est mentionnée (et notifiée) que si elle est
// CHOISIE dans la liste. `search(query)` retourne [{ id, name, avatar_url }] ; sans `search`, c'est un champ ordinaire.
// `as` : "input" (commentaire, une ligne) ou "textarea" (publication).
export default function MentionInput({
  value, onChange, mentions = [], onMentionsChange, search, as: Tag = "input",
  onKeyDown, inputRef, ...rest
}) {
  const [active, setActive] = useState(null); // { start, query }
  const [results, setResults] = useState([]);
  const [highlight, setHighlight] = useState(0);
  const localRef = useRef(null);
  const ref = inputRef || localRef;
  const caretRef = useRef(null);
  const requestRef = useRef(0);

  // Remet le curseur juste après le nom inséré.
  useEffect(() => {
    if (caretRef.current != null && ref.current) {
      ref.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  // Recherche différée, résultats périmés ignorés.
  useEffect(() => {
    if (!active || !search || active.query.trim().length < 1) { setResults([]); return undefined; }
    const id = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const found = await search(active.query.trim());
        if (id === requestRef.current) { setResults((found || []).slice(0, 6)); setHighlight(0); }
      } catch (_) {
        if (id === requestRef.current) setResults([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [active, search]);

  const refresh = (text, caret) => setActive(search ? findActiveMention(text, caret) : null);

  const handleChange = (e) => {
    const text = e.target.value;
    onChange(text);
    onMentionsChange?.(prunedMentions(text, mentions));
    refresh(text, e.target.selectionStart);
  };

  const choose = (profile) => {
    if (!active) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = applyMention(value, active.start, caret, profile);
    onChange(next.text);
    onMentionsChange?.(addMention(prunedMentions(next.text, mentions), profile));
    caretRef.current = next.caret;
    setActive(null);
    setResults([]);
    ref.current?.focus();
  };

  const open = Boolean(active) && results.length > 0;

  const handleKeyDown = (e) => {
    if (open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % results.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + results.length) % results.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(results[highlight]); return; }
      if (e.key === "Escape") { e.preventDefault(); setActive(null); setResults([]); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <span style={{ position: "relative", display: "block", flex: rest.style?.flex ?? undefined }} className={Tag === "input" ? "flex-1" : "w-full"}>
      <Tag
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => refresh(e.target.value, e.target.selectionStart)}
        onKeyUp={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") refresh(e.target.value, e.target.selectionStart); }}
        aria-autocomplete={search ? "list" : undefined}
        aria-expanded={search ? open : undefined}
        {...rest}
        className={`${rest.className || ""} w-full`}
      />
      {open && (
        <ul role="listbox" aria-label="Personnes à mentionner" className="rounded-xl shadow-xl overflow-hidden" style={{ position: "absolute", left: 0, right: 0, bottom: "100%", marginBottom: 4, background: "var(--bb-surface)", border: "1px solid var(--bb-border)", zIndex: 30, maxHeight: 220, overflowY: "auto" }}>
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs"
                style={{ background: i === highlight ? bg : "transparent", color: primary, minHeight: 40 }}
              >
                <Avatar name={p.name} url={p.avatar_url} size={24} />
                <span className="font-semibold truncate">{p.name}</span>
              </button>
            </li>
          ))}
          <li aria-hidden="true" className="px-3 py-1 text-[10px]" style={{ color: muted }}>Choisis une personne pour la notifier</li>
        </ul>
      )}
    </span>
  );
}
