import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../lib/premium/checkout", () => ({ startCheckout: vi.fn(), openBillingPortal: vi.fn() }));
const usePremiumStatusMock = vi.fn();
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: (...a) => usePremiumStatusMock(...a) }));

import PremiumPage from "./PremiumPage";
import { setPremiumIntent } from "../../lib/premium/premiumIntent";

const scrollSpy = vi.fn();
beforeEach(() => {
  scrollSpy.mockClear();
  Element.prototype.scrollIntoView = scrollSpy;
  setPremiumIntent(null);
  usePremiumStatusMock.mockReturnValue({ isPremium: false, subscription: null, loading: false, error: null, refresh: vi.fn() });
});

describe("PremiumPage — compte gratuit", () => {
  it("montre le tableau comparatif et les formules avec prix, période et conditions, sans abonnement", () => {
    render(<PremiumPage currentUser={{ id: "u1" }} onBack={vi.fn()} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("9,99 $")).toBeInTheDocument();
    expect(screen.getByText("79,99 $")).toBeInTheDocument();
    expect(screen.getByText(/renouvellement automatique au tarif affiché jusqu'à annulation/i)).toBeInTheDocument();
    expect(screen.getByText(/annulation possible à tout moment/i)).toBeInTheDocument();
  });

  it("'Découvrir Premium' (aucune intention) : la page reste en haut, pas de défilement", () => {
    render(<PremiumPage currentUser={{ id: "u1" }} onBack={vi.fn()} />);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("'Passer à Premium' (intention 'plans') : défile jusqu'aux formules, une seule fois", () => {
    setPremiumIntent("plans");
    const { rerender } = render(<PremiumPage currentUser={{ id: "u1" }} onBack={vi.fn()} />);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.instances[0].id).toBe("premium-plans");
    rerender(<PremiumPage currentUser={{ id: "u1" }} onBack={vi.fn()} />);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("un compte déjà Premium ne voit ni le tableau d'achat ni les formules", () => {
    usePremiumStatusMock.mockReturnValue({
      isPremium: true,
      subscription: { plan: "monthly", status: "active", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: false },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    render(<PremiumPage currentUser={{ id: "u1" }} onBack={vi.fn()} />);
    expect(screen.queryByRole("table")).toBeNull();
  });
});
