import React from "react";
import { Crown, ShieldCheck, Gem } from "lucide-react";
import { gold, goldText, verified, coral } from "./social/theme";

// Remplace l'empilement VerifiedBadge + FounderBadge + PremiumBadge (3
// icônes côte à côte, sans hiérarchie) par UN SEUL badge, choisi par
// priorité : Fondateur > Vérifié > Premium. Les trois anciens composants
// restent inchangés (mêmes icônes/couleurs, repris ici tels quels) — ce
// composant est une façade qui décide juste lequel afficher.
export default function StatusBadge({ isFounder, isPremium, emailVerified, phoneVerified, size = 14, color }) {
  if (isFounder) {
    return (
      <span title="Fondateur de Baobab" aria-label="Fondateur de Baobab" className="inline-flex items-center justify-center flex-shrink-0" style={{ color: color || goldText }}>
        <Crown size={size} fill={gold} />
      </span>
    );
  }
  if (emailVerified || phoneVerified) {
    // Le titre doit refléter les DEUX champs indépendamment : phoneVerified
    // seul ne veut pas dire que l'email l'est aussi (bug précédent : le badge
    // affichait "Email et téléphone vérifiés" dès que phoneVerified était
    // vrai, même avec emailVerified à false).
    const title = emailVerified && phoneVerified
      ? "Email et téléphone vérifiés"
      : phoneVerified
        ? "Téléphone vérifié"
        : "Email vérifié";
    const c = color || verified;
    return (
      <span title={title} aria-label={title} className="inline-flex items-center justify-center flex-shrink-0" style={{ color: c }}>
        <ShieldCheck size={size} fill={c === "#fff" ? "rgba(255,255,255,0.2)" : "rgba(217,164,65,0.18)"} />
      </span>
    );
  }
  if (isPremium) {
    return (
      <span title="Membre Premium" aria-label="Membre Premium" className="inline-flex items-center justify-center flex-shrink-0" style={{ color: color || coral }}>
        <Gem size={size} fill={gold} />
      </span>
    );
  }
  return null;
}
