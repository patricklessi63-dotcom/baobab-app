import React from "react";
import { Gem } from "lucide-react";
import { coral, gold } from "./social/theme";

// Distinct de VerifiedBadge (contact vérifié) et FounderBadge (fondateur
// unique) — un 3e statut, cumulable avec les deux autres. isPremium vient
// de profiles.is_premium, une colonne mise en cache et synchronisée par
// trigger depuis "subscriptions" (voir supabase-premium-badge.sql) : le
// client n'a pas le droit de lire l'abonnement d'un autre utilisateur
// (RLS), donc ce cache dénormalisé est la seule façon d'afficher ce badge
// sur le profil de quelqu'un d'autre.
export default function PremiumBadge({ isPremium, size = 14 }) {
  if (!isPremium) return null;

  return (
    <span
      title="Membre Premium"
      aria-label="Membre Premium"
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ color: coral }}
    >
      <Gem size={size} fill={gold} />
    </span>
  );
}
