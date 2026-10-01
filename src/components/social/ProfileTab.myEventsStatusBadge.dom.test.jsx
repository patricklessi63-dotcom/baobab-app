import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Bug corrigé à l'audit "Mes événements" (onglet "Événements" de ProfileTab,
// alimenté par SocialShell.jsx) : la requête event_attendees sélectionnait
// bien "status" (going/interested/waitlisted) mais SocialShell.jsx le jetait
// avec .map((r) => r.events), et ProfileTab n'affichait de toute façon aucun
// badge avec cette donnée. Un événement où l'utilisateur est seulement
// "intéressé" ou en liste d'attente apparaissait donc identique à un
// événement où il/elle est confirmé "going" — aucun moyen de les distinguer
// dans cette liste, contrairement à EventCard.jsx (accueil Événements) qui a
// toujours ce badge.

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ then: (resolve) => resolve({ count: 0, error: null }) })),
      })),
    })),
  },
}));

vi.mock("../../lib/premium/usePremiumStatus", () => ({
  usePremiumStatus: () => ({ isPremium: false, subscription: null, loading: false, error: null, refresh: vi.fn() }),
}));

import ProfileTab from "./ProfileTab";

const baseUser = { id: "u1", name: "Awa", is_founder: false, email_verified: false, phone_verified: false };

function setup(myUpcomingEvents) {
  return render(
    <ProfileTab
      currentUser={baseUser}
      openEditProfile={vi.fn()}
      matches={[]}
      candidates={[]}
      profileTab="events"
      setProfileTab={vi.fn()}
      goTab={vi.fn()}
      blockedIds={new Set()}
      myUpcomingEvents={myUpcomingEvents}
      myUpcomingEventsLoading={false}
      onOpenEvents={vi.fn()}
    />
  );
}

describe("ProfileTab — badge de statut de participation dans 'Mes événements'", () => {
  it("affiche 'Tu participes' pour un événement confirmé (going)", () => {
    setup([{ id: "e1", title: "Soirée jeux", category: "loisirs", event_date: new Date(Date.now() + 864e5).toISOString(), myStatus: "going" }]);
    expect(screen.getByText("Tu participes ✓")).toBeInTheDocument();
  });

  it("affiche 'Intéressé(e)' pour un événement où l'utilisateur n'a que manifesté un intérêt", () => {
    setup([{ id: "e2", title: "Café networking", category: "loisirs", event_date: new Date(Date.now() + 864e5).toISOString(), myStatus: "interested" }]);
    expect(screen.getByText("Intéressé(e)")).toBeInTheDocument();
    expect(screen.queryByText("Tu participes ✓")).toBeNull();
  });

  it("affiche 'Liste d'attente' pour un événement complet où l'utilisateur attend une place", () => {
    setup([{ id: "e3", title: "Randonnée", category: "sport", event_date: new Date(Date.now() + 864e5).toISOString(), myStatus: "waitlisted" }]);
    expect(screen.getByText("Liste d'attente")).toBeInTheDocument();
  });

  it("deux événements avec des statuts différents affichent chacun leur propre badge", () => {
    setup([
      { id: "e1", title: "Soirée jeux", category: "loisirs", event_date: new Date(Date.now() + 864e5).toISOString(), myStatus: "going" },
      { id: "e2", title: "Café networking", category: "loisirs", event_date: new Date(Date.now() + 2 * 864e5).toISOString(), myStatus: "interested" },
    ]);
    expect(screen.getByText("Tu participes ✓")).toBeInTheDocument();
    expect(screen.getByText("Intéressé(e)")).toBeInTheDocument();
  });
});
