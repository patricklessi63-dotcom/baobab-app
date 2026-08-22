import React from "react";
import { MapPin } from "lucide-react";
import { C } from "../constants";

// Écran bloquant plein écran (item 2 des specs navigation/auth) : la
// localisation est une condition d'accès au bêta privé. Contrairement à
// banned/suspended (App.jsx), la sortie n'est pas définitive — dès que la
// permission est réaccordée, App.jsx retire ce garde-fou automatiquement
// (voir l'écouteur permissions.query().onchange).
export default function LocationRequiredGate({ onRetry, retrying, error, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.sand }}>
      <div className="bb-card p-8 max-w-sm w-full text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(217,164,65,0.14)" }}>
          <MapPin size={26} color={C.ochre} />
        </div>
        <h1 className="text-lg font-black" style={{ color: "var(--bb-text)" }}>Localisation requise</h1>
        <p className="text-sm mt-3" style={{ color: "rgba(var(--bb-text-rgb),0.7)" }}>
          L'accès au bêta privé de Baobab nécessite la localisation activée. Réactive-la dans les réglages de ton navigateur ou de ton appareil, puis réessaie.
        </p>
        {error && (
          <p className="text-sm mt-3 font-semibold" style={{ color: C.clay }}>{error}</p>
        )}
        <button onClick={onRetry} disabled={retrying} className="w-full mt-6 py-3 rounded-full text-sm font-bold text-white disabled:opacity-60" style={{ background: C.navy }}>
          {retrying ? "Vérification..." : "J'ai réactivé la localisation"}
        </button>
        <button onClick={onSignOut} className="w-full mt-3 py-3 rounded-full text-sm font-semibold" style={{ color: "rgba(var(--bb-text-rgb),0.6)" }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
