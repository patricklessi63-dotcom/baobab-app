import React from "react";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import { primary, muted, card } from "../social/theme";

// Garde de l'écran Premium (onglet « premium » de SocialShell). Drapeau de
// lancement éteint (voir lib/featureFlags.js), l'écran de prix / paiement ne
// doit pas être joignable, même par un lien de retour Stripe saisi à la main
// (?premium=cancelled), une notification « premium_* » ou un bouton d'erreur
// de messagerie. Un compte déjà Premium garde l'accès (gérer / résilier son
// abonnement). Drapeau allumé : transparent, aucune requête en plus.
// La valeur du drapeau arrive en prop (lue par SocialShell) : ce composant,
// chargé à la demande, n'importe pas lib/featureFlags, ce qui garderait le
// drapeau « replié » à la compilation dans le chunk principal (code Premium/IA
// retiré du bundle tant que le drapeau est éteint).
function PremiumGateLegacy({ currentUser, onBack, children }) {
  const { isPremium, loading } = usePremiumStatus(currentUser);
  if (loading) return null;
  if (isPremium) return children;
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className={`${card} p-6 text-center`} style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
        <h2 className="text-base font-black" style={{ color: primary }}>Cette fonctionnalité n'est pas encore disponible</h2>
        <p className="text-sm mt-2" style={{ color: muted }}>Baobab reste entièrement utilisable gratuitement. Nous te préviendrons dès qu'elle ouvrira.</p>
        <button onClick={onBack} className="bb-btn bb-btn-pass bb-hit mt-4 px-5 py-2.5 rounded-full text-sm font-bold">Retour</button>
      </div>
    </div>
  );
}

export default function PremiumGate({ enabled = false, currentUser, onBack, children }) {
  if (enabled) return children;
  return <PremiumGateLegacy currentUser={currentUser} onBack={onBack}>{children}</PremiumGateLegacy>;
}
