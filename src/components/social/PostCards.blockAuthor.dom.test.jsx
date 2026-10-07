import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PostCard from "./PostCard";
import CommunityPostCard from "./CommunityPostCard";

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

// Apple 1.2 / Google Play UGC : « Bloquer » doit être atteignable en une touche
// (+ confirmation) depuis une publication ou un commentaire d'autrui.
const post = { id: "p1", body: "Salut", author_id: "author-1", created_at: "2024-01-01T12:00:00Z", profiles: { name: "Awa" } };
const comment = { id: "c1", post_id: "p1", body: "Un commentaire", author_id: "author-2", profiles: { name: "Moussa" } };
const common = { currentUserId: "viewer-1", commentsLoaded: true, comments: [comment], onLoadComments: vi.fn(), onSubmitComment: vi.fn(), onDelete: vi.fn() };

describe.each([
  ["PostCard", (extra) => render(<PostCard post={post} liked={false} likeCount={0} onToggleLike={vi.fn()} onReport={vi.fn()} onReportComment={vi.fn()} onEdit={vi.fn()} {...common} {...extra} />)],
  ["CommunityPostCard", (extra) => render(<CommunityPostCard post={post} onReport={vi.fn()} onReportComment={vi.fn()} {...common} {...extra} />)],
])("%s — blocage de l'auteur", (_name, renderCard) => {
  it("bloque l'auteur de la publication (id et nom)", async () => {
    const onBlockAuthor = vi.fn();
    renderCard({ onBlockAuthor });
    await userEvent.click(screen.getByRole("button", { name: "Bloquer l'auteur de la publication" }));
    expect(onBlockAuthor).toHaveBeenCalledWith({ id: "author-1", name: "Awa" });
  });

  it("bloque l'auteur d'un commentaire", async () => {
    const onBlockAuthor = vi.fn();
    renderCard({ onBlockAuthor });
    await userEvent.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
    await userEvent.click(screen.getByRole("button", { name: "Bloquer l'auteur de ce commentaire" }));
    expect(onBlockAuthor).toHaveBeenCalledWith({ id: "author-2", name: "Moussa" });
  });

  it("ne propose jamais de se bloquer soi-même", () => {
    renderCard({ onBlockAuthor: vi.fn(), currentUserId: "author-1" });
    expect(screen.queryByRole("button", { name: "Bloquer l'auteur de la publication" })).not.toBeInTheDocument();
  });

  it("n'affiche rien sans gestionnaire", () => {
    renderCard({});
    expect(screen.queryByRole("button", { name: "Bloquer l'auteur de la publication" })).not.toBeInTheDocument();
  });

  // Deux icônes de 12 px séparées de 8 px : leurs zones tactiles de 44 px se chevauchent et la
  // dernière du DOM gagne — toucher le CENTRE de « Signaler » ouvrait « Bloquer » (mesuré à 375 px).
  // La variante verticale (bb-hit-v) étend seulement la hauteur, comme dans CommunityPostCard.
  it("les icônes Signaler / Bloquer d'un commentaire n'ont pas de zones tactiles qui se chevauchent", async () => {
    renderCard({ onBlockAuthor: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
    for (const name of ["Signaler ce commentaire", "Bloquer l'auteur de ce commentaire"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.className).toContain("bb-hit-v");
      expect(btn.className.split(/s+/)).not.toContain("bb-hit");
    }
  });
});
