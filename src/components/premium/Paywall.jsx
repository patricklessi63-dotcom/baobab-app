import React from "react";
import { primary, muted, card } from "../social/theme";

// Paywall réutilisable — barrière d'UX (pas de sécurité, la donnée
// derrière reste déjà lisible ; c'est juste la commodité de filtrage qui
// est réservée). Design volontairement sobre : pas de dizaine de badges
// dorés, juste un rappel discret + un seul bouton d'action.
export default function Paywall({ title = "Fonction Premium", description, onDiscover }) {
  return (
    <div className={`${card} p-6 text-center`} style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
      <div className="h-11 w-11 rounded-2xl mx-auto flex items-center justify-center" style={{ background: "rgba(242,184,75,.18)" }}>
        <span style={{ fontSize: 20 }}>💎</span>
      </div>
      <h3 className="text-base font-black mt-3" style={{ color: primary }}>{title}</h3>
      {description && <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ color: muted }}>{description}</p>}
      <button onClick={onDiscover} className="bb-btn-gold mt-4 px-5 py-2.5 rounded-full text-sm font-bold">
        Découvrir Premium
      </button>
    </div>
  );
}
