import React from "react";
import { RefreshCw } from "lucide-react";
import { C } from "../constants";

// État d'erreur d'un chargement de liste raté (réseau coupé, requête expirée) :
// remplace l'état vide « Aucun/Aucune... », qui laissait croire que la liste
// était réellement vide. Se relance aussi tout seul au retour du réseau (voir
// hooks/useReconnectTick.js).
export default function LoadErrorNotice({ onRetry, what = "cette liste" }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div role="alert" className="p-8 text-center">
      <p className="text-sm mb-4" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
        {offline
          ? `Tu es hors ligne : impossible de charger ${what}. Cela s'affichera dès que ta connexion reviendra.`
          : `Impossible de charger ${what}. Vérifie ta connexion et réessaie.`}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white"
        style={{ background: C.navy, minHeight: 44 }}
      >
        <RefreshCw size={15} /> Réessayer
      </button>
    </div>
  );
}
