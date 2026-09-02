import React from "react";
import { ShieldCheck } from "lucide-react";
import { verified } from "./social/theme";

export default function VerifiedBadge({ emailVerified, phoneVerified, size = 14, color = verified }) {
  if (!emailVerified && !phoneVerified) return null;

  // Le titre doit refléter les DEUX champs indépendamment : phoneVerified
  // seul ne veut pas dire que l'email l'est aussi (bug précédent : le badge
  // affichait "Email et téléphone vérifiés" dès que phoneVerified était
  // vrai, même avec emailVerified à false).
  const title = emailVerified && phoneVerified
    ? "Email et téléphone vérifiés"
    : phoneVerified
      ? "Téléphone vérifié"
      : "Email vérifié";

  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ color }}
    >
      <ShieldCheck size={size} fill={color === "#fff" ? "rgba(255,255,255,0.2)" : "rgba(217,164,65,0.18)"} />
    </span>
  );
}
