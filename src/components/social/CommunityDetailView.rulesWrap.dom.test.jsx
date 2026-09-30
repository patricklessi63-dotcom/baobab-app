import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CommunityDetailView from "./CommunityDetailView";

// Bug corrigé à l'audit de l'affichage des règles de communauté : le texte de
// community.rules est rendu avec whitespace-pre-wrap (pour préserver les
// retours à la ligne saisis par le créateur) mais sans break-words, alors que
// tous les autres textes libres de l'app (post.body, commentaires, messages,
// voir CommunityPostCard.jsx/PostCard.jsx/ConversationPane.jsx) associent
// toujours les deux classes. Un mot très long sans espace (URL collée, etc.)
// dans les règles débordait donc du cadre sur mobile au lieu de se couper,
// aussi bien dans l'encart "avant de rejoindre" (communauté privée) que dans
// l'onglet "À propos".

const longUnbrokenWord = "a".repeat(120);

const baseCommunity = {
  id: "c1",
  name: "Diaspora MTL",
  category: "culture",
  visibility: "private",
  city: "Montréal",
  description: "Une communauté pour la diaspora.",
  rules: `1. Respect\n2. ${longUnbrokenWord}`,
  cover_url: null,
};

const noop = () => {};

function setup(props = {}) {
  return render(
    <CommunityDetailView
      community={{ ...baseCommunity, ...props.community }}
      creatorName="Alex"
      memberCount={5}
      viewerRole={null}
      viewerPending={false}
      currentUser={{ id: "u1" }}
      onBack={noop}
      onJoin={noop}
      onLeave={noop}
      onDeleteCommunity={null}
      onShare={noop}
      onReportCommunity={noop}
      posts={[]}
      postsLoading={false}
      postDraft=""
      setPostDraft={noop}
      onSubmitPost={noop}
      postSubmitting={false}
      commentsByPost={{}}
      onLoadComments={noop}
      onSubmitComment={noop}
      members={[]}
      membersLoading={false}
      onViewMemberProfile={noop}
      onSetMemberRole={noop}
      onRemoveMember={noop}
      joinRequests={[]}
      reports={[]}
      onAcceptRequest={noop}
      onRejectRequest={noop}
      onResolveReport={noop}
      onDismissReport={noop}
      {...props}
    />
  );
}

describe("CommunityDetailView — retour à la ligne des règles sans débordement", () => {
  it("encart « avant de rejoindre » (communauté privée) : whitespace-pre-wrap ET break-words", () => {
    setup();
    const heading = screen.getByText("Règles de la communauté");
    const box = heading.parentElement;
    expect(box.className).toContain("whitespace-pre-wrap");
    expect(box.className).toContain("break-words");
  });

  it("onglet « À propos » : whitespace-pre-wrap ET break-words", async () => {
    const { findByRole } = setup();
    const aboutTab = await findByRole("button", { name: "À propos" });
    aboutTab.click();
    const rulesText = await screen.findByText(new RegExp(longUnbrokenWord));
    expect(rulesText.className).toContain("whitespace-pre-wrap");
    expect(rulesText.className).toContain("break-words");
  });

  it("règles vides : la section « Règles de la communauté » est absente (pas de titre vide)", () => {
    setup({ community: { rules: "" } });
    expect(screen.queryByText("Règles de la communauté")).toBeNull();
  });
});
