import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug corrigé à l'audit (favoris/abonnements, workflow admin
// suspension/bannissement) : l'onglet "Mon réseau" (Abonnements/Abonnés) de
// ProfileTab affichait un profil suivi (ou qui suit l'utilisateur·ice) banni
// ou suspendu par un·e admin comme un compte parfaitement normal (ville...),
// sans la moindre indication — banned_at/suspended_until n'étaient jamais
// consultés ici, contrairement à ConversationCard.jsx/MessagesTab.jsx/
// ConversationPane.jsx pour la même donnée sur un match.

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ then: (resolve) => resolve({ count: 0, error: null }) })),
      })),
    })),
  },
}));

vi.mock("../../lib/premium/usePremiumStatus", () => ({
  usePremiumStatus: () => ({ isPremium: false, subscription: null, loading: false, error: null, refresh: vi.fn() }),
}));

import ProfileTab from "./ProfileTab";

const baseUser = { id: "u1", name: "Awa", is_founder: false, email_verified: false, phone_verified: false };

function setup(followingProfiles) {
  return render(
    <ProfileTab
      currentUser={baseUser}
      openEditProfile={vi.fn()}
      matches={[]}
      candidates={[]}
      profileTab="network"
      setProfileTab={vi.fn()}
      goTab={vi.fn()}
      blockedIds={new Set()}
      followingProfiles={followingProfiles}
      followerProfiles={[]}
      followingIds={new Set(followingProfiles.map((p) => p.id))}
      onToggleFollow={vi.fn()}
      onViewProfile={vi.fn()}
    />
  );
}

describe("ProfileTab — onglet réseau (Abonnements/Abonnés) et comptes bannis/suspendus", () => {
  const baseProfile = { id: "p1", name: "Fatou", city: "Québec", show_city: true };

  it("abonnement actif normal : affiche sa ville", () => {
    setup([baseProfile]);
    expect(screen.getByText("Québec")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("abonnement banni : n'affiche jamais sa ville, montre l'indisponibilité", () => {
    setup([{ ...baseProfile, banned_at: "2026-09-15T00:00:00Z" }]);
    expect(screen.queryByText("Québec")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("abonnement suspendu (date future) : montre l'indisponibilité", () => {
    setup([{ ...baseProfile, suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() }]);
    expect(screen.queryByText("Québec")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée (date passée) : redevient un profil normal, ville affichée", () => {
    setup([{ ...baseProfile, suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() }]);
    expect(screen.getByText("Québec")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
