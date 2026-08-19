import React from "react";
import { Crown } from "lucide-react";
import { gold, goldText } from "./social/theme";

// Distinct de VerifiedBadge.jsx (email/téléphone vérifiés) à dessein — un
// statut différent, pas un remplacement. isFounder vient de la colonne
// profiles.is_founder (voir supabase-founder-badge.sql), protégée par un
// trigger côté base : ne peut jamais être vraie pour plus d'un profil, ni
// modifiée par l'application elle-même.
export default function FounderBadge({ isFounder, size = 14 }) {
  if (!isFounder) return null;

  return (
    <span
      title="Fondateur de Baobab"
      aria-label="Fondateur de Baobab"
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ color: goldText }}
    >
      <Crown size={size} fill={gold} />
    </span>
  );
}
