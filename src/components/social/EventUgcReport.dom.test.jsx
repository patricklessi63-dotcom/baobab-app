import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventCommentsSection from "./EventCommentsSection";
import EventPhotoGallery from "./EventPhotoGallery";

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));
vi.mock("../../supabaseClient", () => ({ supabase: {} }));

// Apple 1.2 / Google Play UGC : les commentaires et photos d'un événement
// (contenu généré par les utilisateurs) doivent pouvoir être signalés.
describe("Commentaires d'événement — signalement", () => {
  const comments = [
    { id: "c1", author_id: "other", body: "Salut tous", profiles: { name: "Awa" } },
    { id: "c2", author_id: "me", body: "Mon message", profiles: { name: "Moi" } },
  ];

  it("signale l'auteur d'un message d'autrui avec son id et son nom", async () => {
    const onReportAuthor = vi.fn();
    render(<EventCommentsSection comments={comments} currentUserId="me" onReportAuthor={onReportAuthor} draft="" setDraft={() => {}} />);
    const buttons = screen.getAllByRole("button", { name: "Signaler ce message" });
    expect(buttons).toHaveLength(1); // jamais sur son propre message
    await userEvent.click(buttons[0]);
    expect(onReportAuthor).toHaveBeenCalledWith({ id: "other", name: "Awa" });
  });

  it("n'affiche aucun bouton si aucun gestionnaire n'est fourni", () => {
    render(<EventCommentsSection comments={comments} currentUserId="me" draft="" setDraft={() => {}} />);
    expect(screen.queryByRole("button", { name: "Signaler ce message" })).not.toBeInTheDocument();
  });
});

describe("Photos d'événement — signalement", () => {
  const photos = [
    { id: "p1", uploaded_by: "other", url: "https://x/1.jpg" },
    { id: "p2", uploaded_by: "me", url: "https://x/2.jpg" },
  ];

  it("signale l'auteur d'une photo d'autrui mais pas la sienne", async () => {
    const onReportAuthor = vi.fn();
    render(<EventPhotoGallery photos={photos} currentUserId="me" onReportAuthor={onReportAuthor} onUpload={{ eventId: "e", save: () => {} }} />);
    const buttons = screen.getAllByRole("button", { name: "Signaler cette photo" });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(onReportAuthor).toHaveBeenCalledWith({ id: "other", name: "l'auteur de cette photo" });
  });

  it("n'affiche aucun bouton si aucun gestionnaire n'est fourni", () => {
    render(<EventPhotoGallery photos={photos} currentUserId="me" onUpload={{ eventId: "e", save: () => {} }} />);
    expect(screen.queryByRole("button", { name: "Signaler cette photo" })).not.toBeInTheDocument();
  });
});
