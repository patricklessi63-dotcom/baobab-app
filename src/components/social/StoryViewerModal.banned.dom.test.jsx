import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StoryViewerModal from "./StoryViewerModal";

// Bug corrigé à l'audit (workflow admin suspension/bannissement) : le panneau
// "Personnes ayant vu ton statut" affichait l'horodatage de la vue pour un
// compte banni/suspendu comme un profil parfaitement normal — SocialShell.jsx
// charge désormais banned_at/suspended_until dans loadStoryViewers(), mais
// rien ici ne les consultait, contrairement à CommunityMemberRow.jsx/
// AdmirersModal.jsx pour la même donnée.

const story = {
  id: "s1",
  profile_id: "author-1",
  name: "Awa",
  initial: "A",
  own: true, // own story : ouvre directement le panneau des vues
  created_at: "2024-01-01T12:00:00Z",
};

function setup(storyViewers) {
  return render(
    <StoryViewerModal
      storyViewerIndex={0}
      stories={[story]}
      storyReply=""
      storyViewersOpen
      storyViewers={storyViewers}
      storyViewersLoading={false}
      storyViewCount={storyViewers.length}
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
      onOpenProfile={vi.fn()}
    />
  );
}

describe("StoryViewerModal — panneau des vues, compte banni/suspendu", () => {
  it("vue d'un profil actif normal : affiche l'horodatage relatif", () => {
    setup([{ profile_id: "v1", name: "Koffi", viewed_at: new Date().toISOString() }]);
    expect(screen.getByText("à l'instant")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("vue d'un compte banni : n'affiche jamais l'horodatage, affiche 'Ce compte n'est plus disponible'", () => {
    setup([
      { profile_id: "v1", name: "Koffi", viewed_at: new Date().toISOString(), banned_at: "2026-09-15T00:00:00Z" },
    ]);
    expect(screen.queryByText("à l'instant")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("vue d'un compte suspendu (date future) : n'affiche jamais l'horodatage", () => {
    setup([
      {
        profile_id: "v1",
        name: "Koffi",
        viewed_at: new Date().toISOString(),
        suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    ]);
    expect(screen.queryByText("à l'instant")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée : redevient une vue normale", () => {
    setup([
      {
        profile_id: "v1",
        name: "Koffi",
        viewed_at: new Date().toISOString(),
        suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);
    expect(screen.getByText("à l'instant")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
