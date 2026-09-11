import React from "react";
import { UserRound, Heart, Users2, PartyPopper, Settings, Cog, Shield, Megaphone, LogOut } from "lucide-react";
import { navy, coral, coralText } from "./theme";

// Menu déroulant du profil (icône ronde à droite du header de
// SocialShell.jsx). À ne pas confondre avec ProfileTab, l'onglet "Mon
// profil" affiché dans le contenu principal.
//
// Extrait tel quel de SocialShell.jsx (aucun changement de comportement) :
// toutes les valeurs ci-dessous étaient déjà calculées dans SocialShell
// (état, callbacks) — ce composant se contente de les recevoir en props et
// de rendre exactement le même JSX qu'avant. Le bouton déclencheur (avatar
// rond) et son `menuRef` restent dans SocialShell ; seul le contenu du menu
// déroulant (le `{menu && (...)}`) est déplacé ici.
export default function ProfileMenu({
  currentUser,
  goTab,
  communitiesBadgeCount,
  eventsBadgeCount,
  setMenu,
  openEditProfile,
  setSettingsOpen,
  updateAvailable,
  myPlatformRole,
  setFeedbackOpen,
  handleSignOut,
}) {
  return (
    <div className="absolute right-0 top-14 w-64 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-2 z-50">
      <div className="rounded-xl p-3 mb-1" style={{ background: `linear-gradient(135deg,${navy},#1E4632)` }}>
        <div className="text-white font-bold">{currentUser?.name || "Ton profil"}</div>
        <div className="text-white/60 text-xs mt-0.5">{currentUser?.city || "Canada"} · 🟢 En ligne</div>
      </div>
      <button onClick={() => { goTab("profile"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><UserRound size={16} className="inline mr-3" />Mon profil</button>
      <button onClick={() => { goTab("discover"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Heart size={16} className="inline mr-3" />Découvrir</button>
      <button onClick={() => { goTab("communities"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)] relative"><Users2 size={16} className="inline mr-3" />Communautés
        {communitiesBadgeCount > 0 && <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full" style={{ background: coral }} />}
      </button>
      <button onClick={() => { goTab("events"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)] relative"><PartyPopper size={16} className="inline mr-3" />Événements
        {eventsBadgeCount > 0 && <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full" style={{ background: coral }} />}
      </button>
      <button onClick={() => { setMenu(false); openEditProfile(); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Settings size={16} className="inline mr-3" />Modifier mon profil</button>
      <button onClick={() => { setMenu(false); setSettingsOpen(true); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)] relative">
        <Cog size={16} className="inline mr-3" />Réglages
        {updateAvailable && <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full" style={{ background: coral }} aria-label="Mise à jour disponible" />}
      </button>
      {myPlatformRole && (
        <button onClick={() => { setMenu(false); goTab("admin"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Shield size={16} className="inline mr-3" />Baobab Admin</button>
      )}
      <button onClick={() => { setMenu(false); setFeedbackOpen(true); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Megaphone size={16} className="inline mr-3" />Un souci, une idée ?</button>
      <button onClick={() => { setMenu(false); handleSignOut(); }} className="w-full text-left rounded-xl px-3 py-3 text-sm" style={{ color: coralText }}><LogOut size={16} className="inline mr-3" />Déconnexion</button>
    </div>
  );
}
