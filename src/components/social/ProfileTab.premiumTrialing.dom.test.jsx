import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug corrigé (même famille que PremiumPage.jsx) : l'onglet "Abonnement" de
// ProfileTab affichait "Baobab Premium actif" + "renouvellement le X" de
// façon identique pour un abonnement payant actif ET pour un essai gratuit
// Stripe en cours (statut "trialing") — alors qu'aucun prélèvement n'a
// encore eu lieu pendant l'essai, et que la date affichée y est celle du
// premier paiement, pas d'un renouvellement.

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

function setup(subscription) {
  usePremiumStatusMock.mockReturnValue({ isPremium: true, subscription, loading: false, error: null, refresh: vi.fn() });
  return render(
    <ProfileTab
      currentUser={baseUser}
      openEditProfile={vi.fn()}
      matches={[]}
      candidates={[]}
      profileTab="premium"
      setProfileTab={vi.fn()}
      goTab={vi.fn()}
      blockedIds={new Set()}
    />
  );
}

describe("ProfileTab — onglet Abonnement, distinction essai gratuit / abonnement payant actif", () => {
  it("essai gratuit en cours : message dédié, pas de 'renouvellement'", () => {
    setup({ plan: "yearly", status: "trialing", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: false });
    expect(screen.getByText(/essai gratuit premium en cours/i)).toBeInTheDocument();
    expect(screen.getByText(/aucun prélèvement pour l'instant, premier paiement le/i)).toBeInTheDocument();
    expect(screen.queryByText(/renouvellement le/i)).toBeNull();
  });

  it("abonnement payant actif (pas d'essai) : garde le message existant", () => {
    setup({ plan: "yearly", status: "active", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: false });
    expect(screen.getByText(/^Baobab Premium actif$/i)).toBeInTheDocument();
    expect(screen.getByText(/renouvellement le/i)).toBeInTheDocument();
  });

  it("essai annulé avant la fin : le dit explicitement, sans 'annulation programmée' (réservé au cas payant)", () => {
    setup({ plan: "yearly", status: "trialing", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: true });
    expect(screen.getByText(/essai annulé : se termine le .* sans aucun prélèvement/i)).toBeInTheDocument();
    expect(screen.queryByText(/^\(annulation programmée à cette date\)$/i)).toBeNull();
  });
});
