import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// « Qui m'a aimé » pour un compte gratuit : fiche explicative (nom, utilité,
// avantages, ce qui reste gratuit) et deux chemins distincts vers l'écran
// Premium — « Découvrir Premium » (haut de page : comparaison) et « Passer à
// Premium » (directement aux formules, via l'intention premiumIntent).

const usePremiumStatusMock = vi.fn();
vi.mock("../../lib/premium/usePremiumStatus", () => ({
  usePremiumStatus: (...args) => usePremiumStatusMock(...args),
}));

import AdmirersModal from "./AdmirersModal";
import { consumePremiumIntent, setPremiumIntent } from "../../lib/premium/premiumIntent";

beforeEach(() => {
  setPremiumIntent(null);
  usePremiumStatusMock.mockReturnValue({ isPremium: false, loading: false });
});

function setup(onUpgrade) {
  return render(
    <AdmirersModal open onClose={vi.fn()} admirerProfiles={[]} admirersCount={3} currentUser={{ id: "me" }} onLikeBack={vi.fn()} onViewProfile={vi.fn()} onUpgrade={onUpgrade} />
  );
}

describe("AdmirersModal — compte gratuit", () => {
  it("affiche le nombre, la fiche de l'avantage et ce qui reste gratuit", () => {
    setup(vi.fn());
    expect(screen.getByText("3 personnes t'ont déjà aimé·e")).toBeInTheDocument();
    expect(screen.getByText(/la liste complète des personnes qui t'ont aimé·e/i)).toBeInTheDocument();
    expect(screen.getByText(/chaque match mutuel reste gratuit/i)).toBeInTheDocument();
  });

  it("'Découvrir Premium' navigue sans intention de défilement", () => {
    const onUpgrade = vi.fn();
    setup(onUpgrade);
    fireEvent.click(screen.getByRole("button", { name: /^découvrir premium$/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(consumePremiumIntent()).toBeNull();
  });

  it("'Passer à Premium' navigue avec l'intention d'aller aux formules", () => {
    const onUpgrade = vi.fn();
    setup(onUpgrade);
    fireEvent.click(screen.getByRole("button", { name: /^passer à premium$/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(consumePremiumIntent()).toBe("plans");
  });
});
