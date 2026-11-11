import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import AiSuggestButton from "./AiSuggestButton";
import Paywall from "../premium/Paywall";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import { openPremium } from "../../lib/premium/premiumIntent";
import { isAiEnabled, isPremiumEnabled } from "../../lib/featureFlags";
import { primary, goldText } from "../social/theme";

// Outils d'écriture IA réservés à Premium dans le composeur de publication :
// « Corriger » (orthographe/grammaire, sens et ton inchangés) et « Rédiger à
// partir de mon idée » (le texte déjà saisi sert d'idée). Comme toute
// suggestion IA : jamais écrite ni publiée sans clic sur « Utiliser ».
//
// Le droit est RE-vérifié côté serveur (Edge Function ai-assist →
// has_premium_feature) : l'affichage d'ici n'est qu'un confort. Un compte
// gratuit voit les outils, et un clic ouvre la fiche Premium au lieu d'un appel.
//
// Quitter le composeur pour découvrir Premium ne doit pas faire perdre le texte :
// on le range d'abord dans le brouillon que le composeur reprend (même clé que
// PostsFeed.jsx, `baobab_post_draft_<id>` — un test garde les deux alignées).
export const POST_DRAFT_KEY_PREFIX = "baobab_post_draft_";

function stashDraft(userId, draft) {
  if (!userId || !draft?.trim()) return;
  try { localStorage.setItem(`${POST_DRAFT_KEY_PREFIX}${userId}`, draft.trim()); } catch (_) { /* stockage indisponible : tant pis */ }
}

const TOOLS = [
  { action: "correct_text", label: "Corriger mon texte" },
  { action: "draft_post", label: "Rédiger à partir de mon idée" },
];

export default function AiWritingTools({ currentUser, draft, onApply, onNavigateAway = () => {}, disabled = false }) {
  const { isPremium, loading } = usePremiumStatus(currentUser);
  const [lockedAction, setLockedAction] = useState(null);

  // Les deux drapeaux de lancement : Premium ouvert ET service IA prêt.
  if (!isPremiumEnabled() || !isAiEnabled() || loading) return null;

  if (isPremium) {
    return (
      <div className="flex flex-col">
        {TOOLS.map((t) => (
          <AiSuggestButton
            key={t.action}
            action={t.action}
            label={`💎 ${t.label}`}
            buildPayload={() => ({ text: draft })}
            onApply={onApply}
            disabled={disabled || !draft.trim()}
          />
        ))}
      </div>
    );
  }

  const go = (intent) => {
    stashDraft(currentUser?.id, draft);
    onNavigateAway();
    openPremium(intent);
  };

  return (
    <div className="mt-1.5">
      <div className="flex flex-col gap-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.action}
            type="button"
            onClick={() => setLockedAction(t.action)}
            disabled={disabled}
            className="bb-hit flex items-center gap-1.5 text-xs font-bold text-left disabled:opacity-50"
            style={{ color: goldText }}
          >
            <Sparkles size={13} aria-hidden="true" /> 💎 {t.label}
          </button>
        ))}
      </div>
      {lockedAction && (
        <div className="mt-2" style={{ color: primary }}>
          <Paywall
            title="Outils d'écriture IA"
            featureKey="ai_writing_tools"
            onDiscover={() => go("discover")}
            onSubscribe={() => go("plans")}
          />
        </div>
      )}
    </div>
  );
}
