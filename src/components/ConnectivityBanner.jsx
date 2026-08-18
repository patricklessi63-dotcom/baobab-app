import React from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

// Bandeau global (item 30) — affiché quel que soit l'écran courant,
// au-dessus de tout le reste (z-[95], même palier que les autres
// notifications ponctuelles de App.jsx).
export default function ConnectivityBanner() {
  const { isOnline, justReconnected } = useOnlineStatus();
  if (isOnline && !justReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[95] flex items-center justify-center gap-2 py-2 text-sm font-semibold text-white"
      style={{ background: isOnline ? "#27C56D" : "#C1613D" }}
    >
      {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
      {isOnline ? "Connexion rétablie." : "Connexion interrompue."}
    </div>
  );
}
