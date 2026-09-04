import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { coral, muted, bg, goldText, primary } from "../social/theme";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { invokeAI } from "../../lib/ai/aiClient";

// "name" est déjà le prénom seul (Step1Identity.jsx sépare "Nom" de famille
// dans last_name) — un split(/\s+/)[0] coupait à tort un prénom composé
// sans trait d'union ("Marie Claude", "Ana Maria") au premier mot avant de
// l'envoyer à l'IA.
function firstName(fullName) {
  return (fullName || "").trim();
}

// "✨ Suggestions" — assistant de conversation à la demande (item 16).
// Génération à la demande (pas automatique à l'ouverture) pour ne pas
// consommer le quota de taux (20/h par défaut, AI_RATE_LIMIT_PER_HOUR côté
// ai-assist) à chaque clic sur le bouton. Ne reçoit que des champs publics
// déjà partagés entre profils mutuellement matchés (prénom/ville/intérêts),
// jamais l'historique de messages — même minimisation que côté Edge Function.
export default function AiConversationSuggestions({ currentUser, match, onPick }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const ref = useRef(null);
  const mountedRef = useRef(true);
  useClickOutside(ref, open, () => setOpen(false));
  useEscapeKey(open, () => setOpen(false));
  useEffect(() => () => { mountedRef.current = false; }, []);

  const generate = async () => {
    setLoading(true);
    setError("");
    // Confidentialité par champ (voir PrivacyFieldsModal.jsx) — "them" envoyait
    // la ville/les intérêts de match sans consulter show_city/show_interests,
    // alors que scoreInterests()/scoreLocation() (matchingService.js) et
    // PublicProfileModal les respectent déjà : un match ayant masqué un champ
    // le voyait quand même transmis tel quel à l'IA (et donc potentiellement
    // reformulé dans une suggestion visible par l'autre personne).
    const { data, error: err } = await invokeAI("suggest_conversation", {
      me: { firstName: firstName(currentUser?.name), city: currentUser?.city, interests: currentUser?.interests },
      them: {
        firstName: firstName(match?.name),
        city: match?.show_city === false ? "" : match?.city,
        interests: match?.show_interests === false ? "" : match?.interests,
      },
    });
    if (!mountedRef.current) return; // composant démonté pendant l'appel IA
    setLoading(false);
    if (err) { setError(err); return; }
    setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
  };

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
        <div className="absolute bottom-14 left-0 w-72 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-3 z-20">
          <div className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1 mb-2" style={{ color: goldText }}>
            <Sparkles size={11} /> Suggestions IA
          </div>

          {!suggestions && !loading && !error && (
            <button type="button" onClick={generate} className="bb-btn-gold w-full py-2 rounded-xl text-xs font-bold">
              Générer des suggestions
            </button>
          )}

          {loading && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: muted }}>
              <Loader2 size={12} className="animate-spin" /> Génération en cours…
            </p>
          )}

          {error && (
            <div role="alert">
              <p className="text-xs" style={{ color: coral }}>{error}</p>
              <button type="button" onClick={generate} className="text-xs font-bold underline mt-1" style={{ color: primary }}>Réessayer</button>
            </div>
          )}

          {suggestions && suggestions.length === 0 && !error && (
            <p className="text-xs" style={{ color: muted }}>Aucune suggestion pour le moment.</p>
          )}

          {suggestions && suggestions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onPick(s); setOpen(false); }}
                  className="text-left text-xs p-2 rounded-xl"
                  style={{ background: bg, color: primary }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
