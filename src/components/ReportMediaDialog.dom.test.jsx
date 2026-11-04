import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const api = vi.hoisted(() => ({
  reportMedia: vi.fn(),
  isModerationMissing: (e) => e?.code === "42883",
}));
vi.mock("../lib/moderationApi", () => api);

import ReportMediaDialog from "./ReportMediaDialog";

const setup = (props = {}) => {
  const onClose = vi.fn();
  const onError = vi.fn();
  render(<ReportMediaDialog open kind="story" targetId="s1" onClose={onClose} onError={onError} {...props} />);
  return { onClose, onError };
};

describe("ReportMediaDialog", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("ne rend rien tant qu'il est fermé", () => {
    render(<ReportMediaDialog open={false} kind="story" targetId="s1" onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("l'envoi reste inactif sans motif ; avec un motif il signale la bonne image puis confirme", async () => {
    api.reportMedia.mockResolvedValue({ reports: 1, hidden: false });
    setup();
    const send = screen.getByRole("button", { name: "Envoyer le signalement" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Contenu sexuel ou nudité"));
    fireEvent.change(screen.getByLabelText(/Précision/), { target: { value: "  photo explicite  " } });
    fireEvent.click(send);
    await waitFor(() => expect(api.reportMedia).toHaveBeenCalledWith("story", "s1", "sexuel", "photo explicite"));
    expect(await screen.findByRole("status")).toHaveTextContent("Merci, ton signalement a été transmis à l'équipe.");
  });

  it("déjà signalée : message dédié, aucun doublon annoncé", async () => {
    api.reportMedia.mockResolvedValue({ duplicate: true });
    setup();
    fireEvent.click(screen.getByLabelText("Violence ou contenu choquant"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Tu as déjà signalé cette image.");
  });

  it("limite horaire : le motif du serveur est affiché", async () => {
    api.reportMedia.mockRejectedValue({ code: "P0001", message: "REPORT_RATE_LIMIT: Trop de signalements en peu de temps, reessaie plus tard." });
    const { onError } = setup();
    fireEvent.click(screen.getByLabelText("Autre"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Trop de signalements en peu de temps, reessaie plus tard."));
  });

  it("SQL-31 pas encore exécuté : message clair", async () => {
    api.reportMedia.mockRejectedValue({ code: "42883", message: "function does not exist" });
    const { onError } = setup();
    fireEvent.click(screen.getByLabelText("Autre"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Le signalement d'images n'est pas encore disponible."));
  });

  it("l'erreur s'affiche dans la boîte même sans canal d'erreur du parent (vue de communauté, profil)", async () => {
    api.reportMedia.mockRejectedValue({ code: "P0001", message: "REPORT_RATE_LIMIT: Trop de signalements en peu de temps, reessaie plus tard." });
    render(<ReportMediaDialog open kind="community_post" targetId="c1" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Autre"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de signalements en peu de temps");
  });

  it("Annuler ferme sans rien envoyer", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.reportMedia).not.toHaveBeenCalled();
  });
});
