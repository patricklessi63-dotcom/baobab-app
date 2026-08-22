import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cancelAccountDeletion } from "../lib/deleteAccount";
import { C } from "../constants";

const GRACE_HOURS = 24;

// Bandeau global (même motif que ConnectivityBanner.jsx) — visible tant que
// currentUser.deletion_requested_at est renseigné, quel que soit l'écran.
// La suppression réelle (Storage inclus) est traitée côté serveur par la
// tâche planifiée pg_cron/pg_net après 24h (voir process-scheduled-deletions,
// même délai qu'ici) ; ce bandeau ne fait qu'annuler la demande.
// Positionnement géré par le conteneur "sticky" partagé dans App.jsx (avant
// : "fixed top-0", qui recouvrait le header et bloquait l'accès au menu
// profil/déconnexion pendant qu'une suppression était en attente).
export default function AccountDeletionBanner({ currentUser, onCancelled = () => {} }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  if (!currentUser?.deletion_requested_at) return null;

  const requestedAt = new Date(currentUser.deletion_requested_at);
  const deletionDate = new Date(requestedAt.getTime() + GRACE_HOURS * 60 * 60 * 1000);
  const hoursLeft = Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / (60 * 60 * 1000)));
  const formattedTime = deletionDate.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  const formattedDate = deletionDate.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError("");
    try {
      await cancelAccountDeletion(currentUser.id);
      onCancelled();
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-center gap-2 py-2 px-3 text-sm font-semibold text-white text-center"
      style={{ background: C.clay }}
    >
      <AlertTriangle size={15} className="shrink-0" />
      <span>Ton compte sera définitivement supprimé le {formattedDate} à {formattedTime} ({hoursLeft} heure{hoursLeft > 1 ? "s" : ""} restante{hoursLeft > 1 ? "s" : ""}).</span>
      <button onClick={handleCancel} disabled={cancelling} className="underline font-bold disabled:opacity-60">
        {cancelling ? "Annulation..." : "Annuler la suppression"}
      </button>
      {error && <span className="text-xs w-full">{error}</span>}
    </div>
  );
}
