import React from "react";
import { X, Star } from "lucide-react";
import Avatar from "../Avatar";
import EmptyState from "../home/EmptyState";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, gold, muted, card } from "./theme";

export default function FavoritesModal({ open, onClose, favoriteProfiles = [], onViewProfile, onToggleFavorite, onDiscover }) {
  useEscapeKey(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-5"
      style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(5px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mes favoris"
    >
      <div className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black" style={{ color: primary }}>⭐ Mes favoris</h2>
          <button onClick={onClose} aria-label="Fermer"><X /></button>
        </div>

        {favoriteProfiles.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Tu n'as encore ajouté personne à tes favoris."
            subtitle="Appuie sur l'étoile ⭐ sur un profil pour le retrouver ici plus tard."
            actionLabel="Découvrir des profils"
            onAction={onDiscover}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {favoriteProfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "rgba(21,27,61,.03)" }}>
                <button onClick={() => onViewProfile?.(p)} className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2">
                  <Avatar name={p.name} url={p.avatar_url} size={44} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{p.name}{p.age ? `, ${p.age}` : ""}</div>
                    {p.city && <div className="text-xs truncate" style={{ color: muted }}>{p.city}</div>}
                  </div>
                </button>
                <button
                  onClick={() => onToggleFavorite?.(p)}
                  aria-label={`Retirer ${p.name} des favoris`}
                  className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2"
                  style={{ background: "#FFF3D6" }}
                >
                  <Star size={15} color={gold} fill={gold} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="w-full mt-5 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(21,27,61,.12)", color: primary }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
