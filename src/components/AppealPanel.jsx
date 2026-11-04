import React, { useEffect, useState } from "react";
import { fetchMySanctions, appealSanction } from "../lib/moderationApi";
import { friendlyDbError } from "../lib/friendlyDbError";

// Contestation d'une sanction automatique (supabase-moderation-text.sql : moderation_appeal), affichée
// sur l'écran « compte suspendu / banni ». Une seule contestation par sanction ; un modérateur l'examine.
// Une suspension ou un bannissement décidé à la main par un modérateur n'a pas de ligne de sanction
// automatique : rien n'est alors proposé ici (l'écran reste inchangé).
export default function AppealPanel() {
  const [sanction, setSanction] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchMySanctions();
        const active = rows.find((s) => s.kind !== "warning");
        if (!cancelled) setSanction(active || null);
      } catch (_) {
        /* SQL-31 pas encore exécuté, ou lecture refusée : on n'affiche rien */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!sanction) return null;

  const status = sent ? "pending" : sanction.appeal_status;
  const submit = async () => {
    if (text.trim().length < 10 || sending) return;
    setSending(true);
    setError("");
    try {
      await appealSanction(sanction.id, text.trim());
      setSent(true);
    } catch (e) {
      setError(friendlyDbError(e) || "Impossible d'envoyer ta contestation. Réessaie.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-5 text-left">
      {status === "pending" && (
        <p role="status" className="text-sm rounded-xl p-3" style={{ background: "rgba(var(--bb-text-rgb),0.05)", color: "var(--bb-text)" }}>
          Ta contestation a été transmise. Un modérateur va l'examiner.
        </p>
      )}
      {status === "rejected" && (
        <p role="status" className="text-sm rounded-xl p-3" style={{ background: "rgba(var(--bb-text-rgb),0.05)", color: "var(--bb-text)" }}>
          Ta contestation a été examinée : la décision est maintenue.
        </p>
      )}
      {!status && (
        <>
          <label className="block">
            <span className="text-xs font-bold" style={{ color: "var(--bb-text-faint)" }}>Tu penses que c'est une erreur ? Explique-nous.</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} className="bb-input w-full mt-1.5" aria-label="Ta contestation" />
          </label>
          {error && <p role="alert" className="text-sm mt-2" style={{ color: "var(--bb-coral-text, #C0392B)" }}>{error}</p>}
          <button onClick={submit} disabled={text.trim().length < 10 || sending} className="w-full mt-2 py-3 rounded-full text-sm font-bold disabled:opacity-40" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.2)", color: "var(--bb-text)", minHeight: 44 }}>
            {sending ? "Envoi..." : "Contester cette décision"}
          </button>
        </>
      )}
    </div>
  );
}
