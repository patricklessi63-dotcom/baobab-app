import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const api = vi.hoisted(() => ({ fetchMySanctions: vi.fn(), appealSanction: vi.fn(), fetchMyModerationStatus: vi.fn(), isModerationMissing: () => false }));
vi.mock("../lib/moderationApi", () => api);

import AppealPanel from "./AppealPanel";

const suspension = { id: "s1", kind: "suspension", until_at: "2026-11-05T10:00:00Z", reason: "Moderation automatique", appeal_status: null };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const status = { confirmed_violations: 5, warnings_before_suspension: 4, suspension_hours: 24, suspensions_before_ban: 3, sanction: null };
beforeEach(() => { api.fetchMyModerationStatus.mockRejectedValue({ code: "42883" }); }); // par défaut : fonction absente

describe("AppealPanel", () => {
  it("rien n'est affiché sans sanction automatique (suspension décidée à la main, ou SQL-31 absent)", async () => {
    api.fetchMySanctions.mockResolvedValue([]);
    const { container } = render(<AppealPanel />);
    await waitFor(() => expect(api.fetchMySanctions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    cleanup();
    api.fetchMySanctions.mockRejectedValue({ code: "42P01" });
    const second = render(<AppealPanel />);
    await waitFor(() => expect(api.fetchMySanctions).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });

  it("un simple avertissement ne propose pas de contestation (compte non bloqué)", async () => {
    api.fetchMySanctions.mockResolvedValue([{ id: "w1", kind: "warning", appeal_status: null }]);
    const { container } = render(<AppealPanel />);
    await waitFor(() => expect(api.fetchMySanctions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("le bouton reste inactif sous 10 caractères ; l'envoi transmet la sanction et le texte, puis confirme", async () => {
    api.fetchMySanctions.mockResolvedValue([suspension]);
    api.appealSanction.mockResolvedValue(null);
    render(<AppealPanel />);
    const send = await screen.findByRole("button", { name: "Contester cette décision" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ta contestation"), { target: { value: "  c'était une citation  " } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    await waitFor(() => expect(api.appealSanction).toHaveBeenCalledWith("s1", "c'était une citation"));
    expect(await screen.findByRole("status")).toHaveTextContent("Ta contestation a été transmise");
    expect(screen.queryByRole("button", { name: "Contester cette décision" })).not.toBeInTheDocument();
  });

  it("appel déjà en cours ou refusé : message, pas de second formulaire", async () => {
    api.fetchMySanctions.mockResolvedValue([{ ...suspension, appeal_status: "pending" }]);
    render(<AppealPanel />);
    expect(await screen.findByRole("status")).toHaveTextContent("Un modérateur va l'examiner");
    cleanup();
    api.fetchMySanctions.mockResolvedValue([{ ...suspension, appeal_status: "rejected" }]);
    render(<AppealPanel />);
    expect(await screen.findByRole("status")).toHaveTextContent("la décision est maintenue");
    expect(screen.queryByLabelText("Ta contestation")).not.toBeInTheDocument();
  });

  it("refus du serveur (déjà contestée) : le motif est affiché", async () => {
    api.fetchMySanctions.mockResolvedValue([suspension]);
    api.appealSanction.mockRejectedValue({ code: "P0001", message: "APPEAL_UNAVAILABLE: Cette sanction ne peut plus etre contestee." });
    render(<AppealPanel />);
    fireEvent.change(await screen.findByLabelText("Ta contestation"), { target: { value: "ce n'est pas moi du tout" } });
    fireEvent.click(screen.getByRole("button", { name: "Contester cette décision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette sanction ne peut plus etre contestee.");
  });

  it("explique la sanction : règle, infractions confirmées, durée, fonctionnement de l'échelle et lien vers les règles", async () => {
    api.fetchMySanctions.mockResolvedValue([suspension]);
    api.fetchMyModerationStatus.mockResolvedValue(status);
    render(<AppealPanel />);
    expect(await screen.findByText(/Règle enfreinte/)).toBeInTheDocument();
    expect(screen.getByText(/Infractions confirmées/).parentElement).toHaveTextContent("Infractions confirmées : 5");
    expect(screen.getByText(/Durée/).parentElement).toHaveTextContent("jusqu'au");
    expect(screen.getByText(/4 avertissements, puis une suspension de 24 h/)).toHaveTextContent("la 3e suspension entraîne un bannissement définitif");
    expect(screen.getByRole("link", { name: "Lire les règles de la communauté" })).toHaveAttribute("href", "/conditions");
    expect(screen.getByRole("button", { name: "Contester cette décision" })).toBeInTheDocument();
  });

  it("bannissement : durée « définitive » ; l'explication est facultative (fonction absente = formulaire seul)", async () => {
    api.fetchMySanctions.mockResolvedValue([{ ...suspension, kind: "ban", until_at: null }]);
    api.fetchMyModerationStatus.mockResolvedValue(status);
    render(<AppealPanel />);
    expect((await screen.findByText(/Durée/)).parentElement).toHaveTextContent("définitive");
    cleanup();
    api.fetchMySanctions.mockResolvedValue([suspension]);
    api.fetchMyModerationStatus.mockRejectedValue({ code: "42883" });
    render(<AppealPanel />);
    expect(await screen.findByRole("button", { name: "Contester cette décision" })).toBeInTheDocument();
    expect(screen.queryByText(/Règle enfreinte/)).not.toBeInTheDocument();
  });
});
