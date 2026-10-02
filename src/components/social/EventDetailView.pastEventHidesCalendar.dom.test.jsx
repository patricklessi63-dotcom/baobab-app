import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit des événements passés (ni annulés, simplement
// terminés) : le menu Partager proposait encore "Télécharger (.ics)" et
// "Ajouter à Google Calendar" pour un événement dont la date est déjà
// passée — alors que "Participer" disparaît déjà dans ce cas (remplacé par
// "Cet événement est déjà passé"). Rien n'empêchait donc d'ajouter à tort à
// son agenda personnel un événement déjà terminé. Même correctif que pour un
// événement annulé (voir EventDetailView.cancelHidesEdit.dom.test.jsx),
// appliqué ici à `isPast` plutôt qu'à `canceled`.

import EventDetailView from "./EventDetailView";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

const BASE_EVENT = {
  id: "e1",
  title: "Brunch du samedi",
  description: "",
  category: "rencontres",
  cover_url: null,
  event_date: new Date(Date.now() + 7 * 864e5).toISOString(),
  duration_minutes: null,
  city: "Montréal",
  location: null,
  max_participants: null,
  visibility: "public",
  community_id: null,
  created_by: "organizer1",
  timezone: null,
  canceled_at: null,
};

const PAST_EVENT = {
  ...BASE_EVENT,
  event_date: new Date(Date.now() - 7 * 864e5).toISOString(),
};

function renderDetail(event, overrides = {}) {
  return render(
    <ImageLightboxProvider>
      <EventDetailView
        event={event}
        viewerRole="organizer"
        viewerStatus="going"
        participantCount={1}
        mutualCount={0}
        currentUser={{ id: "organizer1" }}
        onBack={vi.fn()}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
        onShareFeed={vi.fn()}
        onShareMessage={vi.fn()}
        onOpenInvite={vi.fn()}
        onReportEvent={vi.fn()}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onDeleteEvent={vi.fn()}
        communityName=""
        onOpenCommunity={vi.fn()}
        participants={[]}
        participantsLoading={false}
        onViewParticipantProfile={vi.fn()}
        comments={[]}
        commentsLoading={false}
        commentDraft=""
        setCommentDraft={vi.fn()}
        onSubmitComment={vi.fn()}
        onDeleteComment={vi.fn()}
        photos={[]}
        photosLoading={false}
        onUploadPhoto={{ save: vi.fn() }}
        onDeletePhoto={vi.fn()}
        reports={[]}
        onResolveReport={vi.fn()}
        onDismissReport={vi.fn()}
        blockedIds={new Set()}
        {...overrides}
      />
    </ImageLightboxProvider>
  );
}

describe("EventDetailView — options calendrier du menu Partager pour un événement passé", () => {
  it("propose Télécharger (.ics) et Ajouter à Google Calendar pour un événement à venir", async () => {
    renderDetail(BASE_EVENT);
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.getByRole("button", { name: /Télécharger \(\.ics\)/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ajouter à Google Calendar/ })).toBeInTheDocument();
  });

  it("masque Télécharger (.ics) et Ajouter à Google Calendar une fois l'événement passé", async () => {
    renderDetail(PAST_EVENT);
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.queryByRole("button", { name: /Télécharger \(\.ics\)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ajouter à Google Calendar/ })).not.toBeInTheDocument();
    // Partager reste possible pour se souvenir de l'événement, seul l'ajout
    // à l'agenda personnel n'a plus de sens une fois l'événement terminé.
    expect(screen.getByRole("button", { name: /Dans une conversation/ })).toBeInTheDocument();
  });

  it("affiche 'Cet événement est déjà passé' à la place de Participer quand on n'y participe pas", () => {
    renderDetail(PAST_EVENT, { viewerStatus: null });
    expect(screen.getByText("Cet événement est déjà passé")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Participer/ })).not.toBeInTheDocument();
  });

  it("garde 'Ne plus participer' disponible pour corriger un statut existant sur un événement passé", () => {
    renderDetail(PAST_EVENT, { viewerStatus: "going" });
    expect(screen.getByRole("button", { name: /Ne plus participer/ })).toBeInTheDocument();
  });
});
