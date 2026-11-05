import React from "react";
import { Check } from "lucide-react";
import { primary, muted, card, green } from "../social/theme";
import { FEATURE_DETAILS } from "../../lib/premium/premiumConfig";

// Paywall réutilisable — barrière d'UX (pas de sécurité : ce qui est vraiment
// protégé l'est côté serveur, voir is_premium() et les RPC). Volontairement
// sobre : un rappel discret, jamais une fenêtre qui bloque la suite.
//
// Deux usages :
//  - sans `featureKey` : l'ancien rappel (titre, description, un bouton) ;
//  - avec `featureKey` (clé de FEATURE_DETAILS) : fiche explicative — nom de la
//    fonctionnalité, son utilité, ses avantages, ce qui reste gratuit, puis
//    « Découvrir Premium » (comparaison, sans engagement) et, si `onSubscribe`
//    est fourni, « Passer à Premium » (directement aux formules). Un avantage
//    sans fiche retombe sur l'affichage simple : on n'invente rien.
export default function Paywall({ title = "Fonction Premium", description, onDiscover, onSubscribe, featureKey }) {
  const details = featureKey ? FEATURE_DETAILS[featureKey] : null;
  return (
    <div className={`${card} p-6 text-center`} style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
      <div className="h-11 w-11 rounded-2xl mx-auto flex items-center justify-center" style={{ background: "rgba(242,163,58,.18)" }}>
        <span style={{ fontSize: 20 }}>💎</span>
      </div>
      <h3 className="text-base font-black mt-3" style={{ color: primary }}>{title}</h3>
      {description && <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ color: muted }}>{description}</p>}
      {details && (
        <div className="mt-3 text-left max-w-sm mx-auto">
          <p className="text-sm font-semibold" style={{ color: primary }}>{details.purpose}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {details.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm" style={{ color: primary }}>
                <Check size={16} aria-hidden="true" className="mt-0.5 flex-shrink-0" style={{ color: green }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs mt-3" style={{ color: muted }}>{details.stillFree}</p>
        </div>
      )}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
        <button onClick={onDiscover} className={`${details && onSubscribe ? "bb-btn bb-btn-pass" : "bb-btn-gold"} px-5 py-2.5 rounded-full text-sm font-bold`}>
          Découvrir Premium
        </button>
        {details && onSubscribe && (
          <button onClick={onSubscribe} className="bb-btn-gold px-5 py-2.5 rounded-full text-sm font-bold">
            Passer à Premium
          </button>
        )}
      </div>
    </div>
  );
}
