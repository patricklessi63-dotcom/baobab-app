import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PublicProfileModal from "./PublicProfileModal";

// Bug corrigé à l'audit "profil public" : personality_evening/
// personality_travel/relationship_needs (section "Personnalité" de
// l'onboarding/EditProfileForm) n'étaient affichés nulle part — ce test
// vérifie que la modale de profil public les affiche désormais quand ils
// sont renseignés, et qu'elle ne les affiche pas (au lieu d'une section
// vide) quand ils sont absents.
const baseProfile = {
  id: "u1",
  name: "Awa",
  age: 29,
  city: "Montréal",
  country: "Sénégal",
};

function renderModal(profileOverrides) {
  return render(
    <PublicProfileModal
      profile={{ ...baseProfile, ...profileOverrides }}
      onClose={vi.fn()}
    />
  );
}

describe("PublicProfileModal — section Personnalité", () => {
  it("affiche les réponses de personnalité quand elles sont renseignées", () => {
    renderModal({
      personality_evening: "Une soirée tranquille 🏠",
      personality_travel: "Je planifie tout 🗺️",
      relationship_needs: "Communication, Confiance",
    });
    expect(screen.getByText("Personnalité")).toBeInTheDocument();
    expect(
      screen.getByText("Une soirée tranquille 🏠 · Je planifie tout 🗺️ · Communication, Confiance")
    ).toBeInTheDocument();
  });

  it("n'affiche aucune section Personnalité quand ces champs sont vides", () => {
    renderModal({});
    expect(screen.queryByText("Personnalité")).not.toBeInTheDocument();
  });

  it("affiche uniquement les champs de personnalité réellement renseignés", () => {
    renderModal({ personality_travel: "Je préfère improviser 🎲" });
    expect(screen.getByText("Personnalité")).toBeInTheDocument();
    expect(screen.getByText("Je préfère improviser 🎲")).toBeInTheDocument();
  });
});
