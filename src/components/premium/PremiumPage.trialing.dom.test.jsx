import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug corrigé (audit essai gratuit Stripe, STRIPE_TRIAL_DAYS côté
// create-checkout-session) : isPremium() côté client traite "trialing"
// exactement comme "active" (à raison, pour l'accès aux fonctionnalités),
// mais la carte "Tu es déjà Premium" affichait le même texte dans les deux
// cas — y compris "renouvellement le X" pendant un essai gratuit, alors
// qu'AUCUN prélèvement n'a encore eu lieu et que la date affichée est celle
// du tout premier paiement. Un utilisateur en essai pouvait donc croire à
// tort avoir déjà payé. Ce test fixe le contrat : "trialing" affiche un
// message distinct de "active", et l'annulation pendant l'essai (aucun
// prélèvement à venir) se distingue de l'annulation d'un abonnement payant
// (actif jusqu'à la fin de la période déjà payée).

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

describe("PremiumPage — distinction essai gratuit / abonnement payant actif", () => {
  it("essai gratuit en cours : message dédié, pas de mention de 'renouvellement' ni de paiement déjà effectué", () => {
    setup({ plan: "monthly", status: "trialing", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: false });
    expect(screen.getByText(/essai gratuit premium est en cours/i)).toBeInTheDocument();
    expect(screen.getByText(/aucun prélèvement pour l'instant, premier paiement le/i)).toBeInTheDocument();
    expect(screen.queryByText(/renouvellement le/i)).toBeNull();
  });

  it("abonnement payant actif (pas d'essai) : garde le message 'renouvellement le X' existant", () => {
    setup({ plan: "monthly", status: "active", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: false });
    expect(screen.getByText(/^Tu es déjà Premium$/i)).toBeInTheDocument();
    expect(screen.getByText(/renouvellement le/i)).toBeInTheDocument();
  });

  it("essai annulé avant la fin (aucune facturation à venir) : le dit explicitement, distinct d'une annulation payante", () => {
    setup({ plan: "monthly", status: "trialing", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: true });
    expect(screen.getByText(/essai annulé : se termine le .* sans aucun prélèvement/i)).toBeInTheDocument();
    // Le texte "annulation programmée à cette date, aucun renouvellement"
    // (déjà utilisé pour un abonnement PAYANT annulé) ne doit pas réapparaître
    // ici : ce serait trompeur puisqu'aucun prélèvement n'a jamais eu lieu.
    expect(screen.queryByText(/annulation programmée à cette date, aucun renouvellement/i)).toBeNull();
  });
});
