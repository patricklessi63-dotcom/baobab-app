import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FavoritesModal from "./FavoritesModal";

// Bug corrigé à l'audit (favoris/abonnements, workflow admin
// suspension/bannissement) : "Mes favoris" affichait un profil banni ou
// suspendu par un·e admin comme un compte parfaitement normal (ville,
// badges...), sans la moindre indication — banned_at/suspended_until
// n'étaient jamais consultés ici, contrairement à ConversationCard.jsx/
// MessagesTab.jsx/ConversationPane.jsx pour la même donnée sur un match.
describe("FavoritesModal — comptes bannis/suspendus", () => {
  const baseProfile = { id: "p1", name: "Awa", city: "Montréal", show_city: true };

  it("profil favori actif normal : affiche sa ville", () => {
    render(<FavoritesModal open favoriteProfiles={[baseProfile]} onClose={vi.fn()} />);
    expect(screen.getByText("Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("profil favori banni : n'affiche jamais sa ville, montre l'indisponibilité", () => {
    const banned = { ...baseProfile, banned_at: "2026-09-15T00:00:00Z" };
    render(<FavoritesModal open favoriteProfiles={[banned]} onClose={vi.fn()} />);
    expect(screen.queryByText("Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("profil favori suspendu (date future) : montre l'indisponibilité", () => {
    const suspended = { ...baseProfile, suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
    render(<FavoritesModal open favoriteProfiles={[suspended]} onClose={vi.fn()} />);
    expect(screen.queryByText("Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée (date passée) : redevient un profil normal, ville affichée", () => {
    const expired = { ...baseProfile, suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
    render(<FavoritesModal open favoriteProfiles={[expired]} onClose={vi.fn()} />);
    expect(screen.getByText("Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
