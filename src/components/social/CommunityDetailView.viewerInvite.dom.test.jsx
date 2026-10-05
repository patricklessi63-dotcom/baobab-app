import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommunityDetailView from "./CommunityDetailView";

// Une personne invitée à une communauté « sur invitation » (ou privée) qui
// ouvre la fiche depuis la liste doit pouvoir accepter/refuser son invitation
// — avant, seul le bloc « Tes invitations » de l'accueil de la liste le
// permettait ; la fiche affichait « uniquement sur invitation » sans bouton.

const noop = () => {};
const invite = { id: "i1", community_id: "c1", inviter: { name: "Alex" } };

function setup(visibility, props = {}) {
  const onAcceptInvite = vi.fn();
  const onDeclineInvite = vi.fn();
  render(
    <CommunityDetailView
      community={{ id: "c1", name: "Diaspora MTL", category: "culture", visibility, city: "Montréal" }}
      memberCount={5}
      viewerRole={null}
      viewerPending={false}
      currentUser={{ id: "u1" }}
      onBack={noop} onJoin={noop} onLeave={noop} onShare={noop} onReportCommunity={noop}
      posts={[]} postsLoading={false} postDraft="" setPostDraft={noop} onSubmitPost={noop} postSubmitting={false}
      commentsByPost={{}} onLoadComments={noop} onSubmitComment={noop}
      members={[]} membersLoading={false} onViewMemberProfile={noop} onSetMemberRole={noop} onRemoveMember={noop}
      joinRequests={[]} reports={[]} onAcceptRequest={noop} onRejectRequest={noop} onResolveReport={noop} onDismissReport={noop}
      onAcceptInvite={onAcceptInvite}
      onDeclineInvite={onDeclineInvite}
      {...props}
    />
  );
  return { onAcceptInvite, onDeclineInvite };
}

describe("CommunityDetailView — invitation en attente", () => {
  it("sur invitation + invité·e : boutons Accepter/Refuser, pas de message « uniquement sur invitation »", async () => {
    const user = userEvent.setup();
    const { onAcceptInvite, onDeclineInvite } = setup("invite_only", { viewerInvite: invite });
    expect(screen.queryByText(/uniquement sur invitation/)).toBeNull();
    expect(screen.getByText(/par Alex/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accepter l'invitation" }));
    expect(onAcceptInvite).toHaveBeenCalledWith(invite);
    await user.click(screen.getByRole("button", { name: "Refuser" }));
    expect(onDeclineInvite).toHaveBeenCalledWith(invite);
  });

  it("privée + invité·e : pas de « Demander à rejoindre »", () => {
    setup("private", { viewerInvite: invite });
    expect(screen.queryByRole("button", { name: "Demander à rejoindre" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accepter l'invitation" })).toBeInTheDocument();
  });

  it("sur invitation, non invité·e : message explicatif, aucun bouton d'action", () => {
    setup("invite_only");
    expect(screen.getByText(/uniquement sur invitation/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accepter|Rejoindre|Demander/ })).toBeNull();
  });
});
