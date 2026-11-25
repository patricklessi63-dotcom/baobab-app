import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Console admin : un échec de chargement ne doit JAMAIS ressembler à une liste vide (« Aucun signalement ouvert. ») — un
// modérateur conclurait à tort qu'il n'y a rien à traiter. Et la liste de signalements, plafonnée à 200 par le serveur,
// doit dire quand elle est tronquée.
const mocks = vi.hoisted(() => ({
  fetchDashboardStats: vi.fn(), fetchPremiumStats: vi.fn(), searchUsers: vi.fn(), listReports: vi.fn(), listFeedback: vi.fn(),
  resolveReport: vi.fn(), setReportStatus: vi.fn(), suspendUser: vi.fn(), banUser: vi.fn(), unsuspendUser: vi.fn(), unbanUser: vi.fn(),
}));
vi.mock("../../lib/adminApi", () => mocks);
import AdminDashboard from "./AdminDashboard";

const now = new Date().toISOString();
const openTab = async (label, onError = vi.fn()) => {
  const user = userEvent.setup();
  render(<AdminDashboard onBack={vi.fn()} onError={onError} myPlatformRole="admin" myProfileId="me1" />);
  await user.click(screen.getByRole("button", { name: label }));
  return { user, onError };
};

describe("AdminDashboard — échecs de chargement et listes tronquées", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDashboardStats.mockResolvedValue({ total_users: 1 });
    mocks.searchUsers.mockResolvedValue([]);
    mocks.listFeedback.mockResolvedValue([]);
  });

  it("signalements : un échec affiche une erreur avec « Réessayer », jamais « Aucun signalement ouvert. » ; réessayer recharge", async () => {
    mocks.listReports.mockRejectedValueOnce(new Error("réseau"));
    const { user, onError } = await openTab("Signalements");
    expect(await screen.findByText("Impossible de charger les signalements.")).toBeInTheDocument();
    expect(screen.queryByText("Aucun signalement ouvert.")).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith("Impossible de charger les signalements.");

    mocks.listReports.mockResolvedValueOnce([{ source: "profile", id: "p1", category: "spam", reason: "Pub", status: "open", created_at: now }]);
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Pub")).toBeInTheDocument();
    expect(screen.queryByText("Impossible de charger les signalements.")).not.toBeInTheDocument();
    expect(screen.getByText("1 signalement à traiter")).toBeInTheDocument();
  });

  it("une vraie liste vide reste « Aucun signalement ouvert. »", async () => {
    mocks.listReports.mockResolvedValue([]);
    await openTab("Signalements");
    expect(await screen.findByText("Aucun signalement ouvert.")).toBeInTheDocument();
    expect(screen.queryByText(/Impossible de charger/)).not.toBeInTheDocument();
  });

  it("200 signalements (plafond du serveur) : la console dit que d'autres attendent", async () => {
    mocks.listReports.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ source: "post", id: `o${i}`, category: "spam", reason: `motif ${i}`, status: "open", created_at: now })));
    await openTab("Signalements");
    expect(await screen.findByText("200 signalements à traiter")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Seuls les 200 plus prioritaires sont affichés");
  });

  it("utilisateurs : un échec n'affiche pas « Aucun utilisateur trouvé. »", async () => {
    mocks.searchUsers.mockRejectedValue(new Error("réseau"));
    await openTab("Utilisateurs");
    expect(await screen.findByText("Impossible de charger les utilisateurs.")).toBeInTheDocument();
    expect(screen.queryByText("Aucun utilisateur trouvé.")).not.toBeInTheDocument();
  });

  it("retours : un échec n'affiche pas « Aucun retour dans cette catégorie. »", async () => {
    mocks.listFeedback.mockRejectedValue(new Error("réseau"));
    await openTab("Retours");
    expect(await screen.findByText("Impossible de charger les retours.")).toBeInTheDocument();
    expect(screen.queryByText("Aucun retour dans cette catégorie.")).not.toBeInTheDocument();
  });
});
