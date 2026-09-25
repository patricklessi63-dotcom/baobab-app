import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug corrigé à l'audit du cycle de vie Premium : la carte "Tu es déjà
// Premium" affichait "renouvellement le X" de façon identique, que
// l'abonnement se renouvelle vraiment ou qu'il ait déjà été annulé côté
// Stripe (cancel_at_period_end=true — reste "active" jusqu'à la fin de la
// période déjà payée). ProfileTab.jsx (onglet "Abonnement") distingue déjà
// les deux cas ; PremiumPage.jsx ne le faisait pas, laissant croire à tort
// à un utilisateur ayant annulé que son abonnement allait continuer
// indéfiniment. Ce test fixe le contrat inverse.

vi.mock("../../lib/premium/checkout", () => ({
  startCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
}));

const usePremiumStatusMock = vi.fn();
vi.mock("../../lib/premium/usePremiumStatus", () => ({
  usePremiumStatus: (...args) => usePremiumStatusMock(...args),
}));

import PremiumPage from "./PremiumPage";

function setup(subscription) {
  usePremiumStatusMock.mockReturnValue({
    isPremium: true,
    subscription,
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
  return render(<PremiumPage currentUser={{ id: "u1" }} onBack={vi.fn()} />);
}

describe("PremiumPage — distinction renouvellement automatique / annulation programmée", () => {
  it("abonnement actif qui va se renouveler : pas de mention d'annulation", () => {
    setup({ plan: "yearly", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: false });
    expect(screen.getByText(/renouvellement le/i)).toBeInTheDocument();
    expect(screen.queryByText(/annulation programmée/i)).toBeNull();
  });

  it("abonnement annulé mais encore actif jusqu'à la fin de la période payée : le dit explicitement", () => {
    setup({ plan: "yearly", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: true });
    expect(screen.getByText(/annulation programmée à cette date, aucun renouvellement/i)).toBeInTheDocument();
  });
});
