import React from "react";
import { X, Heart } from "lucide-react";
import Avatar from "../Avatar";
import EmptyState from "../home/EmptyState";
import Paywall from "../premium/Paywall";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import { visibleAge } from "../../utils/format";
import { primary, coral, muted, card, primaryRgb } from "./theme";

// Avantage Premium : qui m'a aimé·e sans réciprocité pour l'instant (voir
// getAdmirers() dans App.jsx). Non-Premium : le nombre reste visible (crée
// l'envie, motif Paywall standard des apps de rencontre), mais jamais les
// identités — cohérent avec Paywall.jsx ("barrière d'UX, pas de sécurité",
// la donnée elle-même n'est pas chargée différemment ici, juste masquée).
export default function AdmirersModal({ open, onClose, admirerProfiles = [], currentUser, onLikeBack, onViewProfile, onUpgrade }) {
  const { isPremium, loading } = usePremiumStatus(currentUser);
  useEscapeKey(open, onClose);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Qui m'a aimé"
    >
      <div className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black" style={{ color: primary }}>💗 Qui m'a aimé</h2>
          <button onClick={onClose} aria-label="Fermer"><X /></button>
        </div>

        {loading ? null : !isPremium ? (
          <Paywall
            title={admirerProfiles.length > 0
              ? (admirerProfiles.length > 1
                ? `${admirerProfiles.length} personnes t'ont déjà aimé·e`
                : "1 personne t'a déjà aimé·e")
              : "Découvre qui t'a aimé·e en premier"}
            description="Passe à Premium pour voir qui t'a déjà aimé·e et matcher directement, sans attendre."
            onDiscover={onUpgrade}
          />
        ) : admirerProfiles.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Personne pour l'instant."
            subtitle="Dès que quelqu'un t'aime, tu le retrouveras ici en premier."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {admirerProfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: `rgba(${primaryRgb},.03)` }}>
                <button onClick={() => onViewProfile?.(p)} className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2">
                  <Avatar name={p.name} url={p.avatar_url} size={44} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{p.name}{visibleAge(p) ? `, ${visibleAge(p)}` : ""}</div>
                    {p.city && <div className="text-xs truncate" style={{ color: muted }}>{p.city}</div>}
                  </div>
                </button>
                <button
                  onClick={() => onLikeBack?.(p)}
                  aria-label={`Aimer ${p.name} en retour`}
                  className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2"
                  style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}
                >
                  <Heart size={15} color={coral} fill={coral} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="w-full mt-5 py-3 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
