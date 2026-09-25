import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StoryViewerModal from "./StoryViewerModal";

const story = {
  id: "s1",
  profile_id: "author-1",
  name: "Awa",
  initial: "A",
  text: "Un moment de la journée",
  own: false,
  created_at: "2024-01-01T12:00:00Z",
};

function setup(props) {
  const handlers = {
    closeStoryViewer: vi.fn(),
    prevStory: vi.fn(),
    nextStory: vi.fn(),
    deleteOwnStory: vi.fn(),
    setStoryReply: vi.fn(),
    sendStoryReply: vi.fn(),
    openStoryViewers: vi.fn(),
    closeStoryViewers: vi.fn(),
    sendStoryReaction: vi.fn(),
    onOpenProfile: vi.fn(),
    onReport: vi.fn(),
    onBlock: vi.fn(),
  };
  const utils = render(
    <StoryViewerModal
      storyViewerIndex={0}
      stories={[story]}
      storyReply=""
      storyViewersOpen={false}
      storyViewers={[]}
      storyViewersLoading={false}
      storyViewCount={0}
      myStoryReaction={null}
      {...handlers}
      {...props}
    />
  );
  return { ...handlers, ...utils };
}

describe("StoryViewerModal — réponse à un statut", () => {
  it("le bouton d'envoi de la réponse est désactivé quand le champ est vide ou ne contient que des espaces (cohérence avec les autres formulaires de l'app, ex. 7fe8017)", () => {
    const { rerender } = setup({ storyReply: "" });
    expect(screen.getByRole("button", { name: "Envoyer la réponse" })).toBeDisabled();

    rerender(
      <StoryViewerModal
        storyViewerIndex={0}
        stories={[story]}
        storyReply="   "
        storyViewersOpen={false}
        storyViewers={[]}
        storyViewersLoading={false}
        storyViewCount={0}
        myStoryReaction={null}
        closeStoryViewer={vi.fn()}
        prevStory={vi.fn()}
        nextStory={vi.fn()}
        deleteOwnStory={vi.fn()}
        setStoryReply={vi.fn()}
        sendStoryReply={vi.fn()}
        openStoryViewers={vi.fn()}
        closeStoryViewers={vi.fn()}
        sendStoryReaction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Envoyer la réponse" })).toBeDisabled();
  });

  it("le bouton d'envoi de la réponse est actif dès qu'un texte non vide est saisi", () => {
    setup({ storyReply: "Salut !" });
    expect(screen.getByRole("button", { name: "Envoyer la réponse" })).toBeEnabled();
  });

  it("n'affiche pas le champ de réponse pour son propre statut (impossible de s'envoyer un message à soi-même)", () => {
    setup({ stories: [{ ...story, own: true }] });
    expect(screen.queryByPlaceholderText(/Répondre à/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer la réponse" })).not.toBeInTheDocument();
  });
});

describe("StoryViewerModal — statut photo dont le média devient indisponible", () => {
  // Scénario concret : le propriétaire supprime son statut (deleteOwnStory,
  // SocialShell.jsx) pendant qu'un·e autre utilisateur·ice l'a encore ouvert
  // en plein écran — le fichier Storage est retiré, mais "stories" n'étant
  // rechargé qu'au montage (pas de canal Realtime dédié), le spectateur garde
  // encore l'URL en cache et continue de la demander. Avant ce correctif,
  // l'échec de chargement de l'image laissait juste l'icône "image cassée"
  // du navigateur en plein écran, sans le moindre message — contrairement à
  // la vidéo (videoError) et à MediaViewerModal.jsx (visualiseur photo des
  // publications), qui affichent déjà tous deux un message de repli dans ce
  // cas.
  const photoStory = { ...story, media_url: "https://example.test/story.jpg", media_kind: "photo" };

  it("affiche un message de repli si l'image du statut échoue à charger", () => {
    setup({ stories: [photoStory] });
    const img = document.querySelector('img[src="https://example.test/story.jpg"]');
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(screen.getByText("Cette image n'est plus disponible.")).toBeInTheDocument();
    expect(document.querySelector('img[src="https://example.test/story.jpg"]')).not.toBeInTheDocument();
  });

  it("réinitialise l'état d'erreur image en changeant de statut (storyViewerIndex)", () => {
    const { rerender } = setup({ stories: [photoStory, { ...photoStory, id: "s2" }], storyViewerIndex: 0 });
    const img = document.querySelector('img[src="https://example.test/story.jpg"]');
    fireEvent.error(img);
    expect(screen.getByText("Cette image n'est plus disponible.")).toBeInTheDocument();

    rerender(
      <StoryViewerModal
        storyViewerIndex={1}
        stories={[photoStory, { ...photoStory, id: "s2" }]}
        storyReply=""
        storyViewersOpen={false}
        storyViewers={[]}
        storyViewersLoading={false}
        storyViewCount={0}
        myStoryReaction={null}
        closeStoryViewer={vi.fn()}
        prevStory={vi.fn()}
        nextStory={vi.fn()}
        deleteOwnStory={vi.fn()}
        setStoryReply={vi.fn()}
        sendStoryReply={vi.fn()}
        openStoryViewers={vi.fn()}
        closeStoryViewers={vi.fn()}
        sendStoryReaction={vi.fn()}
      />
    );
    expect(screen.queryByText("Cette image n'est plus disponible.")).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://example.test/story.jpg"]')).toBeTruthy();
  });
});
