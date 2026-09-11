import React from "react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import { matchKey, visibleAge } from "../../utils/format";
import { muted } from "./theme";

// Dropdown de résultats de la barre de recherche du header de
// SocialShell.jsx (liste "Discussions" + "Personnes" affichée sous le champ
// de recherche pendant la saisie). Le champ de recherche lui-même et son
// `searchRef` (fermeture au clic extérieur) restent dans SocialShell ; seul
// le contenu du dropdown (le `{search && (...)}`) est déplacé ici.
//
// Extrait tel quel de SocialShell.jsx (aucun changement de comportement) :
// conversationResults/searchResults/lastByKey étaient déjà calculés dans
// SocialShell (memo/état) — ce composant se contente de les recevoir en
// props et de rendre exactement le même JSX qu'avant. matchKey et
// visibleAge sont de simples fonctions pures (utils/format), importées
// directement ici comme le fait déjà NotificationsDropdown pour
// groupNotificationRows.
export default function SearchResultsDropdown({
  currentUser,
  lastByKey,
  conversationResults,
  searchResults,
  openChat,
  setSearch,
  setViewedProfileId,
}) {
  return (
    <div className="absolute top-14 left-0 right-0 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-2 z-50 max-h-[70vh] overflow-y-auto">
      {conversationResults.length > 0 && (
        <>
          <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider" style={{ color: muted }}>Discussions</div>
          {conversationResults.slice(0, 5).map((m) => {
            const last = lastByKey[matchKey(currentUser?.id, m.id)];
            return (
              <button key={m.id} onClick={() => { setSearch(""); openChat(m); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--bb-bg)] text-left">
                <Avatar name={m.name} url={m.avatar_url} size={38} />
                <div className="min-w-0"><div className="text-sm font-bold truncate">{m.name}</div><div className="text-xs truncate" style={{ color: muted }}>{last?.text || "Discussion"}</div></div>
              </button>
            );
          })}
        </>
      )}
      <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider" style={{ color: muted }}>Personnes</div>
      {searchResults.slice(0, 8).map((p) => (
        <button key={p.id} onClick={() => { setSearch(""); setViewedProfileId(p.id); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--bb-bg)] text-left">
          <Avatar name={p.name} url={p.avatar_url} size={38} />
          {/* Confidentialité par champ (voir PrivacyFieldsModal.jsx) — la
              recherche globale affichait ville/pays sans consulter
              show_city/show_country, alors que MatchCard/PublicProfileModal
              les respectent déjà : un profil les ayant masqués restait quand
              même visible ici, résultat par résultat. */}
          <div className="min-w-0">
            <div className="text-sm font-bold truncate flex items-center gap-1.5">
              <span dir="auto" className="truncate">{p.name}{visibleAge(p) ? `, ${visibleAge(p)}` : ""}</span>
              {/* Parité de badges (bug corrigé à l'audit, même famille que
                  PublicProfileModal/AdmirersModal/FavoritesModal) : searchResults
                  vient d'un select("*") (cache local "profiles" et requête réseau
                  ci-dessus), la donnée est déjà là — seul le rendu manquait,
                  contrairement à DiscoverTab/MatchCard pour ce même profil. */}
              <StatusBadge isFounder={p.is_founder} isPremium={p.is_premium} emailVerified={p.email_verified} phoneVerified={p.phone_verified} size={12} />
            </div>
            <div className="text-xs" style={{ color: muted }}>{[p.show_city !== false && p.city, p.show_country !== false && p.country].filter(Boolean).join(" · ") || "Canada"}</div>
          </div>
        </button>
      ))}
      {searchResults.length === 0 && conversationResults.length === 0 && <div className="px-3 py-3 text-sm" style={{ color: muted }}>Aucun résultat.</div>}
    </div>
  );
}
