import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug identifié à l'audit du flux d'annulation d'un événement : le bouton
// crayon "Modifier l'événement" (EventDetailView.jsx) restait affiché même
// une fois l'événement annulé (event.canceled_at rempli), contrairement à
// "Participer"/"Annuler l'événement"/"Supprimer l'événement" juste en
// dessous, déjà masqués par `!canceled`. Or EventEditForm.jsx modifie
// event_date/location/city/duration_minutes via un simple .update() sans
// aucune vérification serveur sur canceled_at, et trg_notify_event_updated
// (supabase-events-v2.sql) envoie alors une notification "événement modifié"
// à tous les participants — contredisant la notification d'annulation
// (event_cancelled) déjà reçue pour ce même événement.
//
// Ce test vérifie que le bouton "Modifier l'événement" disparaît bien dès
// que l'événement est annulé, pour un rôle qui aurait normalement le droit
// de modifier (organizer).

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

function renderDetail(event) {
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
      />
    </ImageLightboxProvider>
  );
}

describe("EventDetailView — bouton Modifier après annulation", () => {
  it("affiche le bouton Modifier pour un organisateur tant que l'événement n'est pas annulé", () => {
    renderDetail(BASE_EVENT);
    expect(screen.getByRole("button", { name: "Modifier l'événement" })).toBeInTheDocument();
  });

  it("masque le bouton Modifier une fois l'événement annulé, même pour un organisateur", () => {
    renderDetail({ ...BASE_EVENT, canceled_at: new Date().toISOString() });
    expect(screen.queryByRole("button", { name: "Modifier l'événement" })).not.toBeInTheDocument();
    // Les autres actions restent bien masquées comme avant ce correctif.
    expect(screen.queryByRole("button", { name: /Annuler l'événement/ })).not.toBeInTheDocument();
  });
});
