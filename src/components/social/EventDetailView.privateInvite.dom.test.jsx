import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit des événements PRIVÉS (côté personne invitée) :
//  1. Depuis la fiche, une personne invitée n'avait qu'un "Participer"
//     (join_event) : aucun moyen d'accepter/refuser l'invitation elle-même
//     (même scénario que celui corrigé pour les communautés invite_only).
//     Elle voit maintenant "Accepter l'invitation" / "Refuser".
//  2. Le menu Partager proposait "Dans une conversation" pour un événement
//     privé : la carte envoyée (titre, date, ville, URL signée de la
//     couverture) était lisible par un destinataire sans accès à l'événement.

import EventDetailView from "./EventDetailView";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

const PRIVATE_EVENT = {
  id: "e1",
  title: "Soirée privée",
  description: "",
  category: "rencontres",
  cover_url: "https://example.test/cover.jpg",
  event_date: new Date(Date.now() + 7 * 864e5).toISOString(),
  duration_minutes: null,
  city: "Montréal",
  location: null,
  max_participants: null,
  visibility: "private",
  community_id: null,
  created_by: "organizer1",
  timezone: null,
  canceled_at: null,
};

const INVITE = { id: "inv1", event_id: "e1", inviter: { name: "Aïcha" } };

function renderDetail(event, overrides = {}) {
  const props = {
    event,
    viewerRole: null,
    viewerStatus: null,
    participantCount: 1,
    mutualCount: 0,
    currentUser: { id: "me" },
    onBack: vi.fn(),
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onShareFeed: vi.fn(),
    onShareMessage: vi.fn(),
    onOpenInvite: vi.fn(),
    onReportEvent: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onDeleteEvent: vi.fn(),
    communityName: "",
    onOpenCommunity: vi.fn(),
    participants: [],
    participantsLoading: false,
    onViewParticipantProfile: vi.fn(),
    comments: [],
    commentsLoading: false,
    commentDraft: "",
    setCommentDraft: vi.fn(),
    onSubmitComment: vi.fn(),
    onDeleteComment: vi.fn(),
    photos: [],
    photosLoading: false,
    onUploadPhoto: vi.fn(),
    onDeletePhoto: vi.fn(),
    reports: [],
    onResolveReport: vi.fn(),
    onDismissReport: vi.fn(),
    blockedIds: new Set(),
    ...overrides,
  };
  render(
    <ImageLightboxProvider>
      <EventDetailView {...props} />
    </ImageLightboxProvider>
  );
  return props;
}

describe("EventDetailView — invitation à un événement privé", () => {
  it("propose Accepter/Refuser (et pas Participer) quand une invitation est en attente", async () => {
    const props = renderDetail(PRIVATE_EVENT, { pendingInvite: INVITE, onAcceptInvite: vi.fn(), onDeclineInvite: vi.fn() });
    expect(screen.getByText(/Invité·e par Aïcha/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Participer/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accepter l'invitation" }));
    expect(props.onAcceptInvite).toHaveBeenCalledWith(INVITE);
    await userEvent.click(screen.getByRole("button", { name: "Refuser" }));
    expect(props.onDeclineInvite).toHaveBeenCalledWith(INVITE);
    expect(props.onJoin).not.toHaveBeenCalled();
  });

  it("garde Participer quand il n'y a pas d'invitation en attente", () => {
    renderDetail(PRIVATE_EVENT, { pendingInvite: null });
    expect(screen.getByRole("button", { name: /Participer/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refuser" })).not.toBeInTheDocument();
  });

  it("n'affiche pas l'invitation une fois la personne inscrite", () => {
    renderDetail(PRIVATE_EVENT, { pendingInvite: INVITE, viewerStatus: "going" });
    expect(screen.queryByRole("button", { name: "Accepter l'invitation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ne plus participer/ })).toBeInTheDocument();
  });
});

describe("EventDetailView — partage d'un événement privé", () => {
  it("ne propose pas 'Dans une conversation' pour un événement privé", async () => {
    renderDetail(PRIVATE_EVENT, { viewerStatus: "going" });
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.queryByRole("button", { name: /Dans une conversation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dans le fil Baobab/ })).not.toBeInTheDocument();
  });

  it("n'affiche aucun menu Partager vide pour un événement privé déjà passé", () => {
    renderDetail({ ...PRIVATE_EVENT, event_date: new Date(Date.now() - 864e5).toISOString() }, { viewerStatus: "going" });
    expect(screen.queryByRole("button", { name: "Partager" })).not.toBeInTheDocument();
  });

  it("propose toujours 'Dans une conversation' pour un événement public", async () => {
    renderDetail({ ...PRIVATE_EVENT, visibility: "public" }, { viewerStatus: "going" });
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.getByRole("button", { name: /Dans une conversation/ })).toBeInTheDocument();
  });
});
