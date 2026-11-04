import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const api = vi.hoisted(() => ({
  isModerationMissing: (e) => e?.code === "42883",
  listViolations: vi.fn(),
  listSanctions: vi.fn(),
  listMediaQueue: vi.fn(),
  mediaInfo: vi.fn(),
  resolveFlag: vi.fn(),
  revokeSanction: vi.fn(),
  decideAppeal: vi.fn(),
  moderateMedia: vi.fn(),
  fetchSettings: vi.fn(),
  fetchTerms: vi.fn(),
  upsertTerm: vi.fn(),
  deleteTerm: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("../../lib/moderationApi", () => api);

import ModerationPanel from "./ModerationPanel";

const flag = { id: "v1", profile_id: "p1", profile_name: "Karim", source: "message", category: "insulte", term: "con", severity: "review", excerpt: "quel con", status: "flagged", created_at: "2026-11-04T10:00:00Z" };
const sanction = { id: "s1", profile_id: "p1", profile_name: "Karim", kind: "suspension", until_at: "2026-11-05T10:00:00Z", reason: "Moderation automatique", automatic: true, created_at: "2026-11-04T10:00:00Z", revoked_at: null, appeal_status: null, appeal_text: null };
const media = { target_kind: "story", target_id: "m1", status: "hidden", report_count: 3, suspicious: false, locked: false, hidden_at: "2026-11-04T10:00:00Z", reasons: "sexuel, violence" };

describe("ModerationPanel", () => {
  let onError;
  beforeEach(() => {
    onError = vi.fn();
    api.listViolations.mockResolvedValue([flag]);
    api.listSanctions.mockResolvedValue([sanction]);
    api.listMediaQueue.mockResolvedValue([media]);
    api.mediaInfo.mockResolvedValue({ url: "https://x/img.jpg", owner_name: "Karim", created_at: "2026-11-04T09:00:00Z" });
    api.fetchSettings.mockResolvedValue({ text_filter_enabled: true, auto_ban_enabled: false, window_days: 30, media_report_threshold: 3, media_reports_per_hour: 10 });
    api.fetchTerms.mockResolvedValue([{ id: 1, term: "connard", category: "insulte", severity: "block", active: true }]);
    for (const k of ["resolveFlag", "revokeSanction", "decideAppeal", "moderateMedia", "upsertTerm", "deleteTerm", "updateSettings"]) api[k].mockResolvedValue(null);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("liste les textes à relire et permet d'approuver ou de confirmer, avec le motif saisi", async () => {
    render(<ModerationPanel onError={onError} />);
    expect(await screen.findByText(/Karim — « con »/)).toBeInTheDocument();
    expect(screen.getByText("quel con")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motif de la décision"), { target: { value: "compliment" } });
    fireEvent.click(screen.getByRole("button", { name: "Approuver le texte" }));
    await waitFor(() => expect(api.resolveFlag).toHaveBeenCalledWith("v1", false, "compliment"));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmer l'infraction" }));
    await waitFor(() => expect(api.resolveFlag).toHaveBeenCalledWith("v1", true, null));
  });

  it("la recherche filtre la liste", async () => {
    api.listViolations.mockResolvedValue([flag, { ...flag, id: "v2", profile_name: "Awa", excerpt: "autre texte" }]);
    render(<ModerationPanel onError={onError} />);
    await screen.findByText(/Awa — « con »/);
    fireEvent.change(screen.getByLabelText("Rechercher dans la liste"), { target: { value: "awa" } });
    expect(screen.queryByText(/Karim — « con »/)).not.toBeInTheDocument();
    expect(screen.getByText(/Awa — « con »/)).toBeInTheDocument();
  });

  it("sanctions : annulation par un modérateur ; les appels en attente se décident", async () => {
    render(<ModerationPanel onError={onError} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Sanctions/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Annuler la sanction" }));
    await waitFor(() => expect(api.revokeSanction).toHaveBeenCalledWith("s1", null));

    api.listSanctions.mockResolvedValue([{ ...sanction, appeal_status: "pending", appeal_text: "c'était une citation" }]);
    fireEvent.click(screen.getByRole("tab", { name: /Appels/ }));
    expect(await screen.findByText(/c'était une citation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accepter l'appel" }));
    await waitFor(() => expect(api.decideAppeal).toHaveBeenCalledWith("s1", true, null));
  });

  it("images : aperçu à la demande, puis rétablir / masquer / retirer", async () => {
    render(<ModerationPanel onError={onError} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Images/ }));
    expect(await screen.findByText(/3 signalements/)).toBeInTheDocument();
    expect(screen.getByText(/sexuel, violence/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voir l'image" }));
    expect(await screen.findByAltText("Image signalée")).toHaveAttribute("src", "https://x/img.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Rétablir" }));
    await waitFor(() => expect(api.moderateMedia).toHaveBeenCalledWith("story", "m1", "restore", null));
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(api.moderateMedia).toHaveBeenCalledWith("story", "m1", "remove", null));
  });

  it("réglages et liste de termes : réservés aux administrateurs", async () => {
    const { rerender } = render(<ModerationPanel onError={onError} isAdmin={false} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Réglages/ }));
    const toggle = await screen.findByLabelText(/Filtre de texte actif/);
    expect(toggle).toBeDisabled();
    expect(screen.queryByText(/Termes interdits/)).not.toBeInTheDocument();

    rerender(<ModerationPanel onError={onError} isAdmin />);
    fireEvent.click(screen.getByRole("tab", { name: /Images/ }));
    fireEvent.click(await screen.findByRole("tab", { name: /Réglages/ }));
    expect(await screen.findByText(/Termes interdits \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Filtre de texte actif/));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ text_filter_enabled: false }));
    fireEvent.change(screen.getByLabelText("Nouveau terme"), { target: { value: "zorglub" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(api.upsertTerm).toHaveBeenCalledWith("zorglub", "insulte", "block"));
  });

  it("SQL-31 pas encore exécuté : message clair au lieu d'une erreur", async () => {
    api.listViolations.mockRejectedValue({ code: "42883", message: "function does not exist" });
    render(<ModerationPanel onError={onError} />);
    expect(await screen.findByText(/pas encore installée sur le serveur/)).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it("une action refusée par le serveur remonte une erreur lisible", async () => {
    api.resolveFlag.mockRejectedValue(new Error("Non autorise"));
    render(<ModerationPanel onError={onError} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approuver le texte" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Action impossible. Réessaie."));
  });
});
