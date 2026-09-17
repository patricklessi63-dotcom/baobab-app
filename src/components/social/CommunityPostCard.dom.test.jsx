import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommunityPostCard from "./CommunityPostCard";

// Le visualiseur d'image global passe par un provider monté à la racine :
// on le neutralise, CommunityPostCard n'a pas besoin du vrai.
vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

const post = {
  id: "p1",
  body: "Bonjour la communauté",
  author_id: "author-1",
  created_at: "2024-01-01T12:00:00Z",
  profiles: { name: "Awa" },
};

const comment = {
  id: "c1",
  post_id: "p1",
  body: "Un commentaire",
  author_id: "viewer-1",
  profiles: { name: "Viewer" },
};

function setup(props) {
  const handlers = {
    onReact: vi.fn(),
    onLoadComments: vi.fn(),
    onSubmitComment: vi.fn(),
    onEditComment: vi.fn(),
    onReport: vi.fn(),
    onReportComment: vi.fn(),
    onDelete: vi.fn(),
    onDeleteComment: vi.fn(),
  };
  const utils = render(
    <CommunityPostCard
      post={post}
      currentUserId="viewer-1"
      commentsLoaded
      comments={[comment]}
      {...handlers}
      {...props}
    />
  );
  return { ...handlers, ...utils };
}

describe("CommunityPostCard — édition d'un commentaire", () => {
  it("le bouton de validation de l'édition est désactivé quand le brouillon est vide (cohérence avec l'édition de publication de PostCard.jsx)", async () => {
    const user = userEvent.setup();
    const { onEditComment } = setup();

    // Ouvre les commentaires (déjà chargés) puis passe le commentaire en édition.
    await user.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
    await user.click(screen.getByRole("button", { name: "Modifier ce commentaire" }));

    const input = screen.getByLabelText("Modifier le commentaire");
    const saveButton = screen.getByRole("button", { name: "Valider la modification" });

    // Texte présent par défaut (repris du commentaire) : le bouton est actif.
    expect(saveButton).not.toBeDisabled();

    // Vidé complètement : le bouton doit se désactiver visuellement, comme
    // le bouton "Enregistrer" équivalent de PostCard.jsx (édition de post),
    // au lieu de rester cliquable pour un no-op silencieux.
    await user.clear(input);
    expect(saveButton).toBeDisabled();

    await user.click(saveButton);
    expect(onEditComment).not.toHaveBeenCalled();
  });

  it("valider avec un texte non vide appelle onEditComment avec le nouveau corps", async () => {
    const user = userEvent.setup();
    const { onEditComment } = setup();

    await user.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
    await user.click(screen.getByRole("button", { name: "Modifier ce commentaire" }));

    const input = screen.getByLabelText("Modifier le commentaire");
    await user.clear(input);
    await user.type(input, "Texte modifié");
    await user.click(screen.getByRole("button", { name: "Valider la modification" }));

    expect(onEditComment).toHaveBeenCalledTimes(1);
    expect(onEditComment).toHaveBeenCalledWith("p1", "c1", "Texte modifié");
  });
});
