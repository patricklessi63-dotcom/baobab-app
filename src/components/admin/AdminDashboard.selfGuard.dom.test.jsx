import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug corrigé à l'audit du tableau de bord admin (rôle plateforme
// `myPlatformRole`, jamais audité jusqu'ici pour sa logique de traitement) :
// garde `isSelf` manquante (même pattern que CommunityMemberRow.jsx /
// EventParticipantsList.jsx). L'onglet "Utilisateurs" liste TOUT le monde,
// y compris l'admin/modérateur connecté·e s'il correspond à la recherche.
// Rien ne masquait ses propres boutons Suspendre/Bannir — suspend_user()/
// ban_user() les refusent bien côté serveur ("Cible invalide"), mais
// seulement après avoir ouvert la modale, rempli un motif et cliqué
// "Confirmer", avec un message d'erreur générique qui n'explique pas
// pourquoi.

const mocks = vi.hoisted(() => ({
  fetchDashboardStats: vi.fn(),
  searchUsers: vi.fn(),
  listReports: vi.fn(),
  listFeedback: vi.fn(),
  resolveReport: vi.fn(),
  suspendUser: vi.fn(),
  banUser: vi.fn(),
  unsuspendUser: vi.fn(),
  unbanUser: vi.fn(),
}));

vi.mock("../../lib/adminApi", () => mocks);

import AdminDashboard from "./AdminDashboard";

describe("AdminDashboard — garde isSelf sur Suspendre/Bannir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchUsers.mockResolvedValue([
      { id: "me1", name: "Modérateur Moi-même", avatar_url: null, created_at: new Date().toISOString(), role: "admin", suspended_until: null, banned_at: null },
      { id: "other1", name: "Autre Utilisateur", avatar_url: null, created_at: new Date().toISOString(), role: null, suspended_until: null, banned_at: null },
    ]);
  });

  it("masque Suspendre/Bannir sur sa propre ligne et affiche (toi), tout en les gardant pour les autres", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard onBack={vi.fn()} onError={vi.fn()} myPlatformRole="admin" myProfileId="me1" />);

    await user.click(screen.getByRole("button", { name: "Utilisateurs" }));

    await screen.findByText("Modérateur Moi-même");
    await screen.findByText("Autre Utilisateur");

    expect(screen.getByText("(toi)")).toBeInTheDocument();

    // Une seule paire de boutons Suspendre/Bannir doit exister : celle de
    // "Autre Utilisateur". Aucune sur la ligne de l'admin connecté.
    const suspendButtons = screen.getAllByRole("button", { name: /Suspendre/ });
    const banButtons = screen.getAllByRole("button", { name: /Bannir/ });
    expect(suspendButtons).toHaveLength(1);
    expect(banButtons).toHaveLength(1);
  });
});
