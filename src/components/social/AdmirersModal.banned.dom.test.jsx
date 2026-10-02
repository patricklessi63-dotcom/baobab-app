import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug corrigé à l'audit (workflow admin suspension/bannissement) :
// AdmirersModal ("Qui m'a aimé") affichait la ville d'un·e admirateur·ice
// banni·e ou suspendu·e comme un profil parfaitement normal — profile_public_json()
// (supabase-likers-profile-overexposure-fix.sql) renvoie pourtant déjà
// banned_at/suspended_until pour chaque profil, mais rien ici ne les
// consultait, contrairement à CommunityMemberRow.jsx/FavoritesModal.jsx.

const usePremiumStatusMock = vi.fn();
vi.mock("../../lib/premium/usePremiumStatus", () => ({
  usePremiumStatus: (...args) => usePremiumStatusMock(...args),
}));

import AdmirersModal from "./AdmirersModal";

function setup(admirerProfiles) {
  usePremiumStatusMock.mockReturnValue({ isPremium: true, loading: false });
  return render(
    <AdmirersModal
      open
      onClose={vi.fn()}
      admirerProfiles={admirerProfiles}
      admirersCount={admirerProfiles.length}
      currentUser={{ id: "me" }}
      onLikeBack={vi.fn()}
      onViewProfile={vi.fn()}
      onUpgrade={vi.fn()}
    />
  );
}

describe("AdmirersModal — compte banni/suspendu", () => {
  it("affiche la ville pour un profil actif normal", () => {
    setup([{ id: "p1", name: "Awa", city: "Montréal" }]);
    expect(screen.getByText("Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("compte banni : n'affiche jamais la ville, affiche 'Ce compte n'est plus disponible'", () => {
    setup([{ id: "p1", name: "Awa", city: "Montréal", banned_at: "2026-09-15T00:00:00Z" }]);
    expect(screen.queryByText("Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("compte suspendu (date future) : n'affiche jamais la ville", () => {
    setup([
      { id: "p1", name: "Awa", city: "Montréal", suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    ]);
    expect(screen.queryByText("Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée : redevient un profil normal", () => {
    setup([
      { id: "p1", name: "Awa", city: "Montréal", suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
    ]);
    expect(screen.getByText("Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
