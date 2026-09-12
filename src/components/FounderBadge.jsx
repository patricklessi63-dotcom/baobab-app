import React from "react";
import { Crown } from "lucide-react";
import { goldText } from "./social/theme";

// Distinct de VerifiedBadge.jsx (email/téléphone vérifiés) à dessein — un
// statut différent, pas un remplacement. isFounder vient de la colonne
// profiles.is_founder (voir supabase-founder-badge.sql), protégée par un
// trigger côté base : ne peut jamais être vraie pour plus d'un profil, ni
// modifiée par l'application elle-même.
//
// Composant actuellement remplacé par StatusBadge.jsx (non importé nulle
// part ailleurs dans src/) mais conservé tel quel — corrigé ici par
// cohérence avec le même fix que StatusBadge : icône seule sans texte
// visible à côté, fill="gold" fixe ne donnait que ~1.5-1.8:1 sur les fonds
// clairs (échec du seuil AA graphique 3:1) ; "goldText" (déjà utilisé pour
// le contour) donne ~4.9-5.7:1 en clair, ~9-10:1 en sombre.
export default function FounderBadge({ isFounder, size = 14 }) {
  if (!isFounder) return null;

  return (
    <span
      title="Fondateur de Baobab"
      aria-label="Fondateur de Baobab"
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ color: goldText }}
    >
      <Crown size={size} fill={goldText} />
    </span>
  );
}
