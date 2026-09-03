import React, { useEffect, useState, useRef } from "react";
import { X, Search, UserPlus, Check } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import { supabase } from "../../supabaseClient";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { escapeLikePattern } from "../../lib/searchQuery";
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
  // Garde anti-course : chaque frappe déclenche une requête réseau immédiate
  // (pas de debounce), donc rien ne garantit que les réponses reviennent
  // dans l'ordre où elles sont parties. Sans ce compteur, taper vite "al"
  // puis "alex" pouvait afficher les résultats de "al" si sa réponse
  // arrivait après celle — pourtant plus récente — de "alex" : on
  // n'applique une réponse que si elle correspond encore à la dernière
  // recherche lancée.
  const searchSeqRef = useRef(0);
  const panelRef = useRef(null);

  useEscapeKey(Boolean(community), onClose);
  useFocusTrap(Boolean(community), panelRef);
  // Cette modale reste montée en permanence (CommunitiesTab ne la démonte
  // jamais, elle rend juste `null` en interne) — sans ce reset, rouvrir la
  // modale pour une AUTRE communauté gardait la recherche et les résultats
  // de la communauté précédente, avec des profils encore marqués "Invité·e"
  // (invitedIds) alors qu'ils n'ont jamais été invités dans cette nouvelle
  // communauté.
  useEffect(() => {
    setSearch("");
    setResults([]);
    setInvitedIds(new Set());
    setSendingId(null);
    searchSeqRef.current++; // invalide aussi toute recherche encore en vol pour l'ancienne communauté
  }, [community?.id]);
  if (!community) return null;

  const runSearch = async (value) => {
    setSearch(value);
    const seq = ++searchSeqRef.current;
    if (!value.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        // show_city ajouté (bug corrigé à l'audit) : la liste de résultats
        // affichait la ville sans jamais pouvoir consulter ce réglage, absent
        // de cette requête — voir le garde ajouté juste en dessous.
        // is_founder/is_premium/email_verified/phone_verified ajoutés (bug
        // corrigé à l'audit, même famille que show_city ci-dessus) : sans
        // eux, StatusBadge (ajouté au rendu juste en dessous) ne pouvait
        // jamais s'afficher pour un résultat de cette recherche.
        .select("id, name, avatar_url, city, show_city, is_founder, is_premium, email_verified, phone_verified")
        .ilike("name", `%${escapeLikePattern(value.trim())}%`)
        .neq("id", currentUser.id)
        .limit(15);
      if (error) throw error;
      if (seq !== searchSeqRef.current) return; // une recherche plus récente a déjà pris le relais
      setResults((data || []).filter((p) => !memberIds.has(p.id)));
    } catch (e) {
      if (seq !== searchSeqRef.current) return;
      console.error(e);
      onError?.("Impossible de rechercher des profils.");
    } finally {
      if (seq === searchSeqRef.current) setSearching(false);
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
      <div ref={panelRef} tabIndex={-1} className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
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
            className="flex-1 bg-transparent text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)] min-w-0"
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
                    <div className="text-sm font-bold truncate flex items-center gap-1.5">
                      <span className="truncate">{p.name}</span>
                      <StatusBadge isFounder={p.is_founder} isPremium={p.is_premium} emailVerified={p.email_verified} phoneVerified={p.phone_verified} size={12} />
                    </div>
                    {p.show_city !== false && p.city && <div className="text-xs truncate" style={{ color: muted }}>{p.city}</div>}
                  </div>
                  <button
                    onClick={() => sendInvite(p)}
                    disabled={invited || sendingId === p.id}
                    aria-label={`Inviter ${p.name}`}
                    className="h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold flex-shrink-0 disabled:opacity-60"
                    style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: invited ? "#1F9D6E" : coral }}
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
