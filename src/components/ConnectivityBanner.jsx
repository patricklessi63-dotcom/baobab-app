import React from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { C } from "../constants";

// Bandeau global (item 30) — affiché quel que soit l'écran courant. Rendu
// par App.jsx à l'intérieur d'un conteneur "sticky top-0 z-[95]" partagé
// avec AccountDeletionBanner : ce composant ne gère donc plus lui-même son
// positionnement (auparavant "fixed", ce qui recouvrait le header et
// rendait le menu profil/déconnexion inaccessible pendant qu'un bandeau
// était affiché).
export default function ConnectivityBanner() {
  const { isOnline, justReconnected } = useOnlineStatus();
  if (isOnline && !justReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-white"
      style={{ background: isOnline ? C.online : C.clay }}
    >
      {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
      {isOnline ? "Connexion rétablie." : "Connexion interrompue."}
    </div>
  );
}
