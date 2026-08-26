import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { invokeAI } from "../../lib/ai/aiClient";
import { primary, navy, coral, bg, goldTint, goldText, body } from "../social/theme";

// Bouton réutilisable "✨ Améliorer avec l'IA" pour un champ texte unique
// (bio/publication/description d'événement) — n'écrit JAMAIS
// automatiquement dans le champ cible : l'utilisateur doit cliquer
// "Utiliser" (items 17-19). Résultat toujours étiqueté "✨ Suggestion IA"
// (item 32), jamais présenté comme écrit par une personne réelle.
export default function AiSuggestButton({ action, buildPayload, onApply, label = "Améliorer avec l'IA", disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState("");

  const handleClick = async () => {
    setLoading(true);
    setError("");
    setSuggestion("");
    const { data, error: err } = await invokeAI(action, buildPayload());
    setLoading(false);
    if (err) { setError(err); return; }
    setSuggestion(data?.text || "");
  };

  if (suggestion) {
    return (
      <div className="mt-2 rounded-2xl p-3.5" style={{ background: goldTint, border: "1px solid rgba(242,184,75,.3)" }}>
        <div className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: goldText }}>
          <Sparkles size={11} /> Suggestion IA
        </div>
        <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: navy }}>{suggestion}</p>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={() => setSuggestion("")} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: bg, color: primary }}>Annuler</button>
          <button type="button" onClick={() => { onApply(suggestion); setSuggestion(""); }} className="bb-btn-gold flex-1 py-2 rounded-xl text-xs font-bold">Utiliser</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <button type="button" onClick={handleClick} disabled={disabled || loading} className="flex items-center gap-1.5 text-xs font-bold disabled:opacity-50" style={{ color: coral }}>
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {loading ? "Génération..." : label}
      </button>
      {error && <p className="text-[11px] mt-1" style={{ color: coral }}>{error}</p>}
    </div>
  );
}
