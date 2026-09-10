import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PostCard from "./PostCard";

// Le visualiseur d'image global passe par un provider monté à la racine :
// on le neutralise, PostCard n'a pas besoin du vrai.
vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

const post = {
  id: "p1",
  body: "Bonjour la diaspora",
  author_id: "author-1",
  created_at: "2024-01-01T12:00:00Z",
  profiles: { name: "Awa" },
};

function setup(props) {
  const handlers = {
    onToggleLike: vi.fn(),
    onLoadComments: vi.fn(),
    onSubmitComment: vi.fn(),
    onReport: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
  };
  const utils = render(
    <PostCard post={post} currentUserId="viewer-1" liked={false} likeCount={0} {...handlers} {...props} />
  );
  return { ...handlers, ...utils };
}

describe("PostCard", () => {
  it("affiche le corps de la publication et l'auteur", () => {
    setup();
    expect(screen.getByText("Bonjour la diaspora")).toBeInTheDocument();
    expect(screen.getByText("Awa")).toBeInTheDocument();
  });

  it("le bouton commentaires porte un aria-label", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Afficher les commentaires" })
    ).toBeInTheDocument();
  });

  it("le bouton like porte un aria-label et aria-pressed reflétant l'état", () => {
    const { rerender } = render(
      <PostCard post={post} currentUserId="viewer-1" liked={false} likeCount={2}
        onToggleLike={vi.fn()} onLoadComments={vi.fn()} onSubmitComment={vi.fn()}
        onReport={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Aimer" })).toHaveAttribute("aria-pressed", "false");
    rerender(
      <PostCard post={post} currentUserId="viewer-1" liked likeCount={3}
        onToggleLike={vi.fn()} onLoadComments={vi.fn()} onSubmitComment={vi.fn()}
        onReport={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Retirer le like" })).toHaveAttribute("aria-pressed", "true");
  });

  it("un clic sur like appelle onToggleLike exactement une fois, avec le post", async () => {
    const user = userEvent.setup();
    const { onToggleLike } = setup();
    await user.click(screen.getByRole("button", { name: "Aimer" }));
    expect(onToggleLike).toHaveBeenCalledTimes(1);
    expect(onToggleLike).toHaveBeenCalledWith(post);
  });

  it("ouvrir les commentaires déclenche onLoadComments(postId) quand ils ne sont pas encore chargés", async () => {
    const user = userEvent.setup();
    const { onLoadComments } = setup({ commentsLoaded: false });
    await user.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
    expect(onLoadComments).toHaveBeenCalledTimes(1);
    expect(onLoadComments).toHaveBeenCalledWith("p1");
  });

  it("ouvrir les commentaires ne recharge pas quand ils sont déjà chargés", async () => {
    const user = userEvent.setup();
    const { onLoadComments } = setup({ commentsLoaded: true, comments: [] });
    await user.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
    expect(onLoadComments).not.toHaveBeenCalled();
  });

  it("publication d'un autre : bouton Signaler présent, pas de bouton Modifier", () => {
    setup();
    expect(screen.getByRole("button", { name: "Signaler la publication" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier la publication" })).toBeNull();
  });

  it("ma publication : la suppression passe par ConfirmModal (onDelete pas appelé au 1er clic)", async () => {
    const user = userEvent.setup();
    const mine = { ...post, author_id: "viewer-1" };
    const onDelete = vi.fn();
    render(
      <PostCard post={mine} currentUserId="viewer-1" liked={false} likeCount={0}
        onToggleLike={vi.fn()} onLoadComments={vi.fn()} onSubmitComment={vi.fn()}
        onReport={vi.fn()} onDelete={onDelete} onEdit={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: "Supprimer la publication" }));
    expect(onDelete).not.toHaveBeenCalled();
    // la modale de confirmation est ouverte
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(mine);
  });
});
