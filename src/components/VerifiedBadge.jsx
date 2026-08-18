import React from "react";
import { ShieldCheck } from "lucide-react";
import { verified } from "./social/theme";

export default function VerifiedBadge({ emailVerified, phoneVerified, size = 14, color = verified }) {
  if (!emailVerified && !phoneVerified) return null;

  const title = phoneVerified
    ? "Email et téléphone vérifiés"
    : "Email vérifié";

  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ color }}
    >
      <ShieldCheck size={size} fill={color === "#fff" ? "rgba(255,255,255,0.2)" : "rgba(56,151,240,0.15)"} />
    </span>
  );
}
