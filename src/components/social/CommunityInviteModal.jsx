import React, { useState } from "react";
import { X, Search, UserPlus, Check } from "lucide-react";
import Avatar from "../Avatar";
import { supabase } from "../../supabaseClient";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, muted, card, primaryRgb } from "./theme";

// Recherche par nom dans profiles (déjà en lecture publique pour la
// découverte) — exclut les membres déjà présents et soi-même. La
// contrainte unique (community_id, invited_profile_id) empêche déjà
// d'inviter deux fois la même personne (anti-spam, item 27).
export default function CommunityInviteModal({ community, currentUser, memberIds = new Set(), onClose, onError }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [sendingId, setSendingId] = useState(null);

  useEscapeKey(Boolean(community), onClose);
  if (!community) return null;

  const runSearch = async (value) => {
    setSearch(value);
    if (!value.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, city")
        .ilike("name", `%${value.trim()}%`)
        .neq("id", currentUser.id)
        .limit(15);
      if (error) throw error;
      setResults((data || []).filter((p) => !memberIds.has(p.id)));
    } catch (e) {
      console.error(e);
      onError?.("Impossible de rechercher des profils.");
    } finally {
      setSearching(false);
    }
  };

  const sendInvite = async (profile) => {
    setSendingId(profile.id);
    try {
      const { error } = await supabase.from("community_invites").insert({
        community_id: community.id,
        invited_by: currentUser.id,
        invited_profile_id: profile.id,
      });
      if (error) throw error;
      setInvitedIds((s) => new Set(s).add(profile.id));
    } catch (e) {
      console.error(e);
      onError?.("Impossible d'envoyer cette invitation (déjà invité·e ?).");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div
      className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5"
      style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Inviter des membres dans ${community.name}`}
    >
      <div className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black" style={{ color: primary }}>Inviter dans {community.name}</h2>
          <button onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-4" style={{ background: "rgba(0,0,0,.03)" }}>
          <Search size={16} color={muted} />
          <input
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Rechercher un nom..."
            aria-label="Rechercher un profil à inviter"
            className="flex-1 bg-transparent text-sm outline-none min-w-0"
            autoFocus
          />
        </div>

        {searching ? (
          <p className="text-sm text-center py-4" style={{ color: muted }}>Recherche...</p>
        ) : results.length === 0 ? (
          search.trim() && (
            <p className="text-sm text-center py-4" style={{ color: muted }}>Aucun profil trouvé.</p>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((p) => {
              const invited = invitedIds.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: `rgba(${primaryRgb},.03)` }}>
                  <Avatar name={p.name} url={p.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{p.name}</div>
                    {p.city && <div className="text-xs truncate" style={{ color: muted }}>{p.city}</div>}
                  </div>
                  <button
                    onClick={() => sendInvite(p)}
                    disabled={invited || sendingId === p.id}
                    aria-label={`Inviter ${p.name}`}
                    className="h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold flex-shrink-0 disabled:opacity-60"
                    style={{ background: invited ? "#EEF8F4" : "#FDEAE7", color: invited ? "#1F9D6E" : coral }}
                  >
                    {invited ? <><Check size={13} /> Invité·e</> : <><UserPlus size={13} /> Inviter</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={onClose} className="w-full mt-5 py-3 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
