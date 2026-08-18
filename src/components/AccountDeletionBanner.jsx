import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cancelAccountDeletion } from "../lib/deleteAccount";
import { C } from "../constants";

const GRACE_DAYS = 7;

// Bandeau global (même motif que ConnectivityBanner.jsx) — visible tant que
// currentUser.deletion_requested_at est renseigné, quel que soit l'écran.
// La suppression réelle (Storage inclus) est traitée côté serveur par la
// tâche planifiée pg_cron/pg_net après 7 jours (voir
// process-scheduled-deletions) ; ce bandeau ne fait qu'annuler la demande.
export default function AccountDeletionBanner({ currentUser, onCancelled = () => {} }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  if (!currentUser?.deletion_requested_at) return null;

  const requestedAt = new Date(currentUser.deletion_requested_at);
  const deletionDate = new Date(requestedAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
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
      className="fixed top-0 left-0 right-0 z-[95] flex flex-wrap items-center justify-center gap-2 py-2 px-3 text-sm font-semibold text-white text-center"
      style={{ background: C.clay }}
    >
      <AlertTriangle size={15} className="shrink-0" />
      <span>Ton compte sera définitivement supprimé le {formattedDate} ({daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}).</span>
      <button onClick={handleCancel} disabled={cancelling} className="underline font-bold disabled:opacity-60">
        {cancelling ? "Annulation..." : "Annuler la suppression"}
      </button>
      {error && <span className="text-xs w-full">{error}</span>}
    </div>
  );
}
