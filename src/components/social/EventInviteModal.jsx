import React, { useRef } from "react";
import { X, Check } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import EmptyState from "../home/EmptyState";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { primary, muted, card, primaryRgb } from "./theme";

// Source d'invitation = connexions mutuelles (likes croisés — il n'existe
// pas de table "matches" dans ce schéma) + membres de la communauté
// associée à l'événement, si applicable. Aucun autre graphe de contacts
// n'existe dans l'app pour inviter plus largement.
export default function EventInviteModal({ open, candidates = [], invitedIds = new Set(), sending, onInvite, onClose }) {
  const panelRef = useRef(null);
  useEscapeKey(open, onClose);
  useFocusTrap(open, panelRef);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Inviter des personnes">
      <div ref={panelRef} tabIndex={-1} className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[80vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black" style={{ color: primary }}>Inviter des personnes</h2>
          <button onClick={onClose} aria-label="Fermer"><X /></button>
        </div>

        {candidates.length === 0 ? (
          <EmptyState title="Personne à inviter pour l'instant." subtitle="Tes connexions mutuelles apparaîtront ici." />
        ) : (
          <div className="flex flex-col gap-1">
            {candidates.map((p) => {
              const invited = invitedIds.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <Avatar name={p.name} url={p.avatar_url} size={38} />
                  <span className="text-sm font-semibold flex-1 truncate flex items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    {/* Parité de badges (bug corrigé à l'audit, même famille
                        que CommunityInviteModal) : champs désormais chargés
                        dans openInvite() (EventsTab.jsx). */}
                    <StatusBadge isFounder={p.is_founder} isPremium={p.is_premium} emailVerified={p.email_verified} phoneVerified={p.phone_verified} size={12} />
                  </span>
                  {invited ? (
                    <span className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: "#2F8F6B" }}>
                      <Check size={12} /> Invité
                    </span>
                  ) : (
                    <button
                      onClick={() => onInvite(p)}
                      disabled={sending}
                      className="bb-btn-gold text-xs font-bold px-3.5 py-1.5 rounded-full disabled:opacity-50"
                    >
                      Inviter
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] mt-4" style={{ color: muted }}>Les invitations sont limitées pour éviter le spam.</p>
      </div>
    </div>
  );
}
