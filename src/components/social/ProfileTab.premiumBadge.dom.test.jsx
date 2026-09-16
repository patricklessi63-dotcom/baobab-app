import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug corrigé à l'audit Premium : l'en-tête de ProfileTab affichait le badge
// Premium à partir de currentUser?.is_premium — une colonne "profiles" mise
// en cache par trigger SQL depuis "subscriptions" (supabase-premium-badge.sql),
// mais currentUser vient de applyOwnProfile() dans App.jsx, appelé une seule
// fois à l'ouverture de session et jamais rafraîchi ensuite. Un·e utilisateur
// qui s'abonnait à Premium PENDANT la session voyait donc l'onglet
// "Abonnement" (isPremium recalculé en direct par usePremiumStatus) passer à
// "Tu es déjà Premium" sans que le badge du haut de page apparaisse, jusqu'à
// recharger l'app. Ce test fixe le contrat : une fois le hook chargé, le
// badge suit l'état LIVE (isPremium), pas la colonne mise en cache — dans un
// sens comme dans l'autre.

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

const usePremiumStatusMock = vi.fn();
vi.mock("../../lib/premium/usePremiumStatus", () => ({
  usePremiumStatus: (...args) => usePremiumStatusMock(...args),
}));

import ProfileTab from "./ProfileTab";

const baseUser = { id: "u1", name: "Awa", is_founder: false, email_verified: false, phone_verified: false };

function setup({ currentUser, premiumStatus }) {
  usePremiumStatusMock.mockReturnValue({ isPremium: false, subscription: null, loading: false, refresh: vi.fn(), ...premiumStatus });
  return render(
    <ProfileTab
      currentUser={currentUser}
      openEditProfile={vi.fn()}
      matches={[]}
      candidates={[]}
      profileTab="about"
      setProfileTab={vi.fn()}
      goTab={vi.fn()}
      blockedIds={new Set()}
    />
  );
}

describe("ProfileTab — badge Premium de son propre profil", () => {
  it("abonnement souscrit pendant la session : badge affiché dès que le hook confirme isPremium, même si currentUser.is_premium (cache) est encore false", () => {
    setup({
      currentUser: { ...baseUser, is_premium: false },
      premiumStatus: { isPremium: true, loading: false, subscription: { plan: "monthly" } },
    });
    expect(screen.getByTitle("Membre Premium")).toBeInTheDocument();
  });

  it("abonnement expiré : badge retiré dès que le hook recalcule isPremium à false, même si currentUser.is_premium (cache) est resté true", () => {
    setup({
      currentUser: { ...baseUser, is_premium: true },
      premiumStatus: { isPremium: false, loading: false, subscription: { status: "canceled" } },
    });
    expect(screen.queryByTitle("Membre Premium")).toBeNull();
  });

  it("pendant le chargement initial du hook, retombe sur la valeur mise en cache pour éviter un badge qui clignote", () => {
    setup({
      currentUser: { ...baseUser, is_premium: true },
      premiumStatus: { isPremium: false, loading: true, subscription: null },
    });
    expect(screen.getByTitle("Membre Premium")).toBeInTheDocument();
  });
});
