import React from "react";
import { Clock } from "lucide-react";
import { C } from "../constants";

// Bandeau global (même motif que AccountDeletionBanner.jsx/
// ConnectivityBanner.jsx) — visible quand le minuteur d'inactivité de
// App.jsx approche la déconnexion automatique (15 min). "Rester connecté"
// réinitialise le minuteur via onStayConnected (même geste que n'importe
// quelle activité utilisateur, pas une action spéciale côté serveur).
export default function SessionExpiryBanner({ visible, onStayConnected }) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[95] flex flex-wrap items-center justify-center gap-2 py-2 px-3 text-sm font-semibold text-white text-center"
      style={{ background: C.clay }}
    >
      <Clock size={15} className="shrink-0" />
      <span>Ta session va expirer pour inactivité.</span>
      <button onClick={onStayConnected} className="underline font-bold">
        Rester connecté
      </button>
    </div>
  );
}
