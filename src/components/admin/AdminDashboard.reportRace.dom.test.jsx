import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug corrigé à l'audit du tableau de bord admin : course de traitement d'un
// même signalement par deux membres du staff plateforme (moderator/admin/
// super_admin) en même temps — aucun canal Realtime n'existe sur les tables
// de signalement, donc la file peut afficher la même ligne à deux membres du
// staff à la fois. Même classe de bug que les demandes d'adhésion aux
// communautés (commit 833f240). Voir
// supabase-admin-resolve-report-race-fix.sql pour le correctif serveur :
// admin_resolve_report() lève désormais "Signalement introuvable ou deja
// traite" pour un signalement déjà traité par un collègue, reconnu ici pour
// retirer la ligne avec un message exact plutôt qu'un échec générique.

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

describe("AdminDashboard — signalement déjà traité par un autre membre du staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listReports.mockResolvedValue([
      { source: "community", id: "r1", category: "spam", reason: "Contenu indésirable", created_at: new Date().toISOString() },
    ]);
    mocks.resolveReport.mockRejectedValue(new Error("Signalement introuvable ou deja traite"));
  });

  it("retire le signalement de la file et affiche un message exact plutôt qu'un échec générique", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(<AdminDashboard onBack={vi.fn()} onError={onError} myPlatformRole="admin" myProfileId="me1" />);

    await user.click(screen.getByRole("button", { name: "Signalements" }));

    await screen.findByText("spam");
    await user.click(screen.getByRole("button", { name: "Résolu" }));

    await screen.findByText("Aucun signalement ouvert.");
    expect(screen.queryByText("spam")).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(
      "Ce signalement a déjà été traité (par toi ou un autre membre du staff) entre-temps."
    );
    expect(onError).not.toHaveBeenCalledWith("Impossible de traiter ce signalement.");
  });
});
