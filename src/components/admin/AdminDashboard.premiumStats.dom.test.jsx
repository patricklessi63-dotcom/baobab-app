import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchDashboardStats: vi.fn(), fetchPremiumStats: vi.fn(), searchUsers: vi.fn(), listReports: vi.fn(), listFeedback: vi.fn(),
  resolveReport: vi.fn(), setReportStatus: vi.fn(), suspendUser: vi.fn(), banUser: vi.fn(), unsuspendUser: vi.fn(), unbanUser: vi.fn(),
}));
vi.mock("../../lib/adminApi", () => mocks);
import AdminDashboard from "./AdminDashboard";

const base = { total_users: 6, suspended_users: 0, banned_users: 0, open_reports: 0, pending_info_review: 0, open_feedback: 0, critical_feedback: 0 };
const premium = { members_total: 6, premium_total: 2, trialing: 1, paid: 1, monthly: 1, yearly: 1, cancel_scheduled: 0, past_due: 0, new_last_30_days: 2, canceled_last_30_days: 0, conversion_percent: 33.3 };
const open = (role) => render(<AdminDashboard onBack={vi.fn()} onError={vi.fn()} myPlatformRole={role} myProfileId="me1" />);

describe("AdminDashboard — bloc Premium", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.fetchDashboardStats.mockResolvedValue(base); });

  it("un administrateur voit les chiffres réels, sans aucun montant", async () => {
    mocks.fetchPremiumStats.mockResolvedValue(premium);
    open("admin");
    const section = await screen.findByLabelText("Statistiques Premium");
    expect(section).toHaveTextContent("Abonnés Premium");
    expect(section).toHaveTextContent("33,3");
    expect(section.textContent).not.toMatch(/\$|€|CAD|USD/);
  });

  it("un modérateur n'appelle même pas la fonction réservée aux administrateurs", async () => {
    open("moderator");
    await screen.findByText("Utilisateurs");
    expect(mocks.fetchPremiumStats).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Statistiques Premium")).not.toBeInTheDocument();
  });

  it("si la fonction échoue, le tableau de bord reste intact et le bloc est masqué sans message d'erreur", async () => {
    mocks.fetchPremiumStats.mockRejectedValue(new Error("42501"));
    const onError = vi.fn();
    render(<AdminDashboard onBack={vi.fn()} onError={onError} myPlatformRole="admin" myProfileId="me1" />);
    await screen.findByText("Utilisateurs");
    expect(screen.queryByLabelText("Statistiques Premium")).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
