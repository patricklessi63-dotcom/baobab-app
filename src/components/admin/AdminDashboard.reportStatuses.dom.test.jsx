import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Statuts de signalement (supabase-report-statuses.sql) : en attente / en cours d'examen / confirmé, puis résolu ou rejeté.
const mocks = vi.hoisted(() => ({
  fetchDashboardStats: vi.fn(),
  searchUsers: vi.fn(),
  listReports: vi.fn(),
  listFeedback: vi.fn(),
  resolveReport: vi.fn(),
  setReportStatus: vi.fn(),
  suspendUser: vi.fn(),
  banUser: vi.fn(),
  unsuspendUser: vi.fn(),
  unbanUser: vi.fn(),
}));
vi.mock("../../lib/adminApi", () => mocks);

import AdminDashboard from "./AdminDashboard";

const now = new Date().toISOString();
const rows = () => [
  { source: "profile", id: "p1", category: "harcelement", reason: "Insultes répétées", status: "open", created_at: now },
  { source: "community", id: "c1", category: "spam", reason: "Publicité", status: "in_review", created_at: now },
  { source: "post", id: "o1", category: "arnaque", reason: "Faux lien", status: "confirmed", created_at: now },
];

async function openReports(onError = vi.fn(), firstText = "Insultes répétées") {
  const user = userEvent.setup();
  render(<AdminDashboard onBack={vi.fn()} onError={onError} myPlatformRole="admin" myProfileId="me1" />);
  await user.click(screen.getByRole("button", { name: "Signalements" }));
  await screen.findByText(firstText);
  return { user, onError };
}
const card = (text) => screen.getByText(text).closest("div.p-4") || screen.getByText(text).closest("div");

describe("AdminDashboard — statuts de signalement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listReports.mockResolvedValue(rows());
    mocks.setReportStatus.mockResolvedValue(undefined);
    mocks.resolveReport.mockResolvedValue(undefined);
  });

  it("affiche le statut de chaque signalement et les actions adaptées à ce statut", async () => {
    await openReports();
    expect(within(card("Insultes répétées")).getByText("En attente")).toBeInTheDocument();
    expect(within(card("Publicité")).getByText("En cours d'examen")).toBeInTheDocument();
    expect(within(card("Faux lien")).getByText("Confirmé")).toBeInTheDocument();
    // en attente : prendre en charge + confirmer ; en cours : libérer + confirmer ; confirmé : seulement résolu / rejeter
    const open = within(card("Insultes répétées"));
    expect(open.getByRole("button", { name: "Prendre en charge" })).toBeInTheDocument();
    expect(open.getByRole("button", { name: "Confirmer" })).toBeInTheDocument();
    const review = within(card("Publicité"));
    expect(review.getByRole("button", { name: "Libérer" })).toBeInTheDocument();
    expect(review.queryByRole("button", { name: "Prendre en charge" })).not.toBeInTheDocument();
    const confirmed = within(card("Faux lien"));
    expect(confirmed.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument();
    expect(confirmed.getByRole("button", { name: "Résolu" })).toBeInTheDocument();
    expect(confirmed.getByRole("button", { name: "Rejeter" })).toBeInTheDocument();
  });

  it("« Prendre en charge » appelle le serveur avec l'identifiant et la source, et met la ligne à jour sans recharger", async () => {
    const { user } = await openReports();
    await user.click(within(card("Insultes répétées")).getByRole("button", { name: "Prendre en charge" }));
    await waitFor(() => expect(mocks.setReportStatus).toHaveBeenCalledWith("profile", "p1", "in_review"));
    expect(await within(card("Insultes répétées")).findByRole("button", { name: "Libérer" })).toBeInTheDocument();
    expect(mocks.listReports).toHaveBeenCalledTimes(1);
  });

  it("« Rejeter » et « Résolu » clôturent le signalement et le retirent de la file", async () => {
    const { user } = await openReports();
    await user.click(within(card("Faux lien")).getByRole("button", { name: "Rejeter" }));
    await waitFor(() => expect(mocks.resolveReport).toHaveBeenCalledWith("post", "o1", true));
    await waitFor(() => expect(screen.queryByText("Faux lien")).not.toBeInTheDocument());
  });

  it("filtres par catégorie et par statut", async () => {
    const { user } = await openReports();
    await user.selectOptions(screen.getByLabelText("Filtrer par catégorie"), "spam");
    expect(screen.queryByText("Insultes répétées")).not.toBeInTheDocument();
    expect(screen.getByText("Publicité")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filtrer par catégorie"), "all");
    await user.selectOptions(screen.getByLabelText("Filtrer par statut"), "confirmed");
    expect(screen.getByText("Faux lien")).toBeInTheDocument();
    expect(screen.queryByText("Publicité")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filtrer par catégorie"), "spam");
    expect(screen.getByText(/Aucun signalement ne correspond à ces filtres/)).toBeInTheDocument();
  });

  it("statuts pas encore installés sur le serveur : message clair, les boutons intermédiaires disparaissent, Résolu et Rejeter restent", async () => {
    mocks.setReportStatus.mockRejectedValue({ code: "PGRST202", message: "Could not find the function public.admin_set_report_status" });
    const { user, onError } = await openReports();
    await user.click(within(card("Insultes répétées")).getByRole("button", { name: "Prendre en charge" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("pas encore installés")));
    expect(screen.queryByRole("button", { name: "Prendre en charge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Résolu" }).length).toBe(3);
  });

  it("signalement déjà traité par un collègue : retiré de la file avec un message exact", async () => {
    mocks.setReportStatus.mockRejectedValue(new Error("Signalement introuvable ou deja traite"));
    const { user, onError } = await openReports();
    await user.click(within(card("Insultes répétées")).getByRole("button", { name: "Prendre en charge" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("déjà été traité")));
    expect(screen.queryByText("Insultes répétées")).not.toBeInTheDocument();
  });

  it("un serveur qui ne renvoie pas encore de statut (ancienne fonction) : tout est « en attente », comme avant", async () => {
    mocks.listReports.mockResolvedValue([{ source: "community", id: "r1", category: "spam", reason: "Contenu indésirable", created_at: now }]);
    await openReports(vi.fn(), "Contenu indésirable");
    expect(within(card("Contenu indésirable")).getByText("En attente")).toBeInTheDocument();
  });

  it("les catégories s'affichent en français (jamais la clé brute) et le filtre propose toutes les catégories connues, pas seulement celles affichées", async () => {
    mocks.listReports.mockResolvedValue([{ source: "profile", id: "p9", category: "mineur_suspecte", reason: "Doute sur l'âge", status: "open", created_at: now }]);
    const { user } = await openReports(vi.fn(), "Doute sur l'âge");
    expect(within(card("Doute sur l'âge")).getByText("Mineur suspecté")).toBeInTheDocument();
    expect(screen.queryByText("mineur_suspecte")).not.toBeInTheDocument();
    const select = screen.getByLabelText("Filtrer par catégorie");
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    for (const expected of ["Catégorie : Harcèlement", "Catégorie : Arnaque", "Catégorie : Faux événement", "Catégorie : Usurpation d'identité", "Catégorie : Lien incorrect"]) {
      expect(labels).toContain(expected);
    }
  });

  it("une catégorie inconnue du client reste affichée telle quelle (jamais masquée) et filtrable", async () => {
    mocks.listReports.mockResolvedValue([{ source: "info", id: "i1", category: "nouvelle_categorie", reason: "Cas particulier", status: "open", created_at: now }]);
    const { user } = await openReports(vi.fn(), "Cas particulier");
    expect(within(card("Cas particulier")).getByText("nouvelle_categorie")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filtrer par catégorie"), "nouvelle_categorie");
    expect(screen.getByText("Cas particulier")).toBeInTheDocument();
  });
});
