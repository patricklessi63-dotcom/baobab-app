import React from "react";
import { Crown, ShieldCheck, Gem } from "lucide-react";
import { gold, goldText, verified, coral } from "./social/theme";

// Remplace l'empilement VerifiedBadge + FounderBadge + PremiumBadge (3
// icônes côte à côte, sans hiérarchie) par UN SEUL badge, choisi par
// priorité : Fondateur > Vérifié > Premium. Les trois anciens composants
// restent inchangés (mêmes icônes/couleurs, repris ici tels quels) — ce
// composant est une façade qui décide juste lequel afficher.
//
// Crown/Gem : ce badge est une ICÔNE SEULE sans texte visible à côté
// (title/aria-label ne sont que pour les lecteurs d'écran) — elle porte
// l'info seule (fondateur/premium), donc soumise au seuil WCAG AA
// "graphique non-textuel" (3:1), pas 4.5:1. Le or fixe #F2B84B ne donne
// que ~1.5-1.8:1 sur --bb-surface/--bb-bg/--bb-surface-2 en thème clair
// (échec massif) : par défaut on remplit désormais avec "goldText", déjà
// réactif au thème (~4.9-5.7:1 en clair, ~9-10:1 en sombre, voir
// --bb-gold-text dans index.html). Seule exception, comme pour ShieldCheck
// juste en dessous : quand l'appelant force color="#fff" (DiscoverTab,
// badge posé sur le dégradé marine FIXE au bas d'une photo, ~6.3:1 avec le
// or vif quel que soit le thème), on garde le or fixe "gold" — goldText y
// tomberait à ~2:1 en thème clair puisque ce fond-là n'est pas réactif.
export default function StatusBadge({ isFounder, isPremium, emailVerified, phoneVerified, size = 14, color }) {
  if (isFounder) {
    return (
      <span title="Fondateur de Baobab" aria-label="Fondateur de Baobab" className="inline-flex items-center justify-center flex-shrink-0" style={{ color: color || goldText }}>
        <Crown size={size} fill={color === "#fff" ? gold : goldText} />
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
        <Gem size={size} fill={color === "#fff" ? gold : goldText} />
      </span>
    );
  }
  return null;
}
