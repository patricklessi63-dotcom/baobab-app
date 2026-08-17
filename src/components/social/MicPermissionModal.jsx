import React from "react";
import { Mic } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, muted, bg, card } from "./theme";

const STEPS = [
  "Touche l'icône 🔒 ou 🎚️ à côté de l'adresse du site, en haut de l'écran",
  "Ouvre \"Autorisations\" (ou \"Permissions du site\")",
  "Trouve \"Microphone\" et choisis \"Autoriser\"",
  "Reviens ici et touche \"Réessayer\"",
];

// Popup unique pour toute la demande d'accès micro : déclenche la vraie
// popup native du navigateur au clic sur "Autoriser l'accès", puis bascule
// automatiquement vers des instructions simples si le navigateur a déjà
// refusé le micro pour ce site (dans ce cas précis, aucun bouton d'un site
// web — le nôtre ou un autre — ne peut ré-accorder l'accès à sa place ;
// c'est une règle de sécurité du navigateur, pas une limite de Baobab).
export default function MicPermissionModal({ open, blocked, requesting, onAllow, onClose }) {
  useEscapeKey(open, onClose);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-5"
      style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Accès au microphone"
    >
      <div className={`${card} p-6 max-w-sm w-full text-center`} onClick={(e) => e.stopPropagation()}>
        <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center" style={{ background: "#FFF3F1" }}>
          <Mic size={24} color={coral} />
        </div>

        {!blocked ? (
          <>
            <h2 className="text-lg font-black mt-4" style={{ color: primary }}>Accès au micro</h2>
            <p className="text-sm mt-2" style={{ color: muted }}>
              Baobab a besoin d'accéder à ton micro pour envoyer des messages vocaux. Ton navigateur va te demander de confirmer.
            </p>
            <button
              onClick={onAllow}
              disabled={requesting}
              className="w-full mt-5 py-3 rounded-full text-sm font-bold text-white disabled:opacity-60"
              style={{ background: coral }}
            >
              {requesting ? "Demande en cours..." : "Autoriser l'accès"}
            </button>
            <button onClick={onClose} className="w-full mt-2 py-3 rounded-full text-sm font-semibold" style={{ color: muted }}>
              Refuser
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-black mt-4" style={{ color: primary }}>Le micro est bloqué</h2>
            <p className="text-sm mt-2" style={{ color: muted }}>
              Le micro a déjà été refusé pour Baobab dans ton navigateur. Pour l'autoriser :
            </p>
            <ol className="text-sm text-left mt-3 rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: bg, color: "#20243A" }}>
              {STEPS.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-black flex-shrink-0" style={{ color: coral }}>{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <button
              onClick={onAllow}
              disabled={requesting}
              className="w-full mt-4 py-3 rounded-full text-sm font-bold text-white disabled:opacity-60"
              style={{ background: coral }}
            >
              {requesting ? "Vérification..." : "Réessayer"}
            </button>
            <button onClick={onClose} className="w-full mt-2 py-3 rounded-full text-sm font-semibold" style={{ color: muted }}>
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
