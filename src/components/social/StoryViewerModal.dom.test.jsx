import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
