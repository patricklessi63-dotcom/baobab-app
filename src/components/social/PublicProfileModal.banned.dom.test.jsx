import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PublicProfileModal from "./PublicProfileModal";

// Bug corrigé à l'audit (workflow admin suspension/bannissement) : cette
// fiche profil complète — reliée depuis TOUTES les listes déjà corrigées
// ailleurs (favoris, conversations, membres d'une communauté, recherche,
// "Qui m'a aimé"...) — affichait la ville/pays d'un compte banni ou suspendu
// comme un profil parfaitement normal. banned_at/suspended_until sont
// pourtant déjà chargés pour tout profil tiers ouvert ici
// (OTHER_PROFILE_COLUMNS), mais rien ici ne les consultait.
const baseProfile = {
  id: "u1",
  name: "Awa",
  age: 29,
  city: "Montréal",
  country: "Sénégal",
};

function renderModal(profileOverrides) {
  return render(<PublicProfileModal profile={{ ...baseProfile, ...profileOverrides }} onClose={vi.fn()} />);
}

describe("PublicProfileModal — compte banni/suspendu", () => {
  it("affiche la ville/pays pour un profil actif normal", () => {
    renderModal({});
    expect(screen.getByText("📍 Montréal · Sénégal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("compte banni : n'affiche jamais la ville/pays, affiche 'Ce compte n'est plus disponible'", () => {
    renderModal({ banned_at: "2026-09-15T00:00:00Z" });
    expect(screen.queryByText("📍 Montréal · Sénégal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("compte suspendu (date future) : n'affiche jamais la ville/pays", () => {
    renderModal({ suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    expect(screen.queryByText("📍 Montréal · Sénégal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée : redevient un profil normal", () => {
    renderModal({ suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    expect(screen.getByText("📍 Montréal · Sénégal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
