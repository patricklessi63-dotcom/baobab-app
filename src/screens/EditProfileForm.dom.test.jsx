import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditProfileForm from "./EditProfileForm";

// Le visualiseur d'image global passe par un provider monté à la racine :
// on le neutralise, EditProfileForm n'a pas besoin du vrai (même pattern que
// PostCard.dom.test.jsx).
vi.mock("../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

const baseEditForm = {
  name: "Awa",
  lastName: "",
  birthDate: "1995-01-01",
  age: 30,
  country: "",
  province: "",
  city: "",
  arrivedSince: "",
  immigrationStatus: "",
  occupation: "",
  educationLevel: "",
  arrivalCity: "",
  languagesDetail: [],
  languages: "",
  lookingFor: [],
  relationshipValues: [],
  interests: [],
  hasChildren: "",
  wantsChildren: "",
  familyImportance: "",
  careerGoal: "",
  geographicOpenness: "",
  personalityEvening: "",
  personalityTravel: "",
  relationshipNeeds: [],
  bio: "",
};

// Deux photos seulement : avec 3+ photos, la photo du milieu a à la fois une
// flèche "gauche" et "droite", ce qui rendrait les libellés ambigus pour
// getByLabelText ci-dessous (chaque flèche n'apparaît alors qu'une seule fois).
const existingPhotos = [
  { id: "p1", url: "https://x/p1.jpg", position: 0 },
  { id: "p2", url: "https://x/p2.jpg", position: 1 },
];

function setup(props) {
  const handlers = {
    setView: vi.fn(),
    setEditForm: vi.fn(),
    setCoverFile: vi.fn(),
    setCoverPreview: vi.fn(),
    setCoverRemoved: vi.fn(),
    removeExistingPhoto: vi.fn(),
    moveExistingPhoto: vi.fn(),
    setPrimaryPhoto: vi.fn(),
    removeNewPhotoFile: vi.fn(),
    handleNewPhotosSelected: vi.fn(),
    handleSaveProfile: vi.fn((e) => e.preventDefault()),
    onError: vi.fn(),
  };
  const utils = render(
    <EditProfileForm
      editForm={baseEditForm}
      coverPreview=""
      currentUser={{ id: "u1", avatar_url: existingPhotos[0].url }}
      coverRemoved={false}
      existingPhotos={existingPhotos}
      newPhotoPreviews={[]}
      savingProfile={false}
      {...handlers}
      {...props}
    />
  );
  return { ...handlers, ...utils };
}

// Bug corrigé à l'audit réordonnancement (voir moveExistingPhoto/App.jsx) :
// handleSaveProfile capture existingPhotos dans une closure au moment du clic
// sur "Enregistrer" et ne recalcule avatar_url/les positions qu'une fois
// l'upload réseau terminé. Sans désactiver les contrôles de photos pendant
// savingProfile, un réordonnancement/suppression/ajout concurrent pouvait
// écrire des données déjà obsolètes (avatar_url pointant vers une photo qui
// n'est plus en position 0, voire déjà supprimée).
describe("EditProfileForm — contrôles photos pendant l'enregistrement", () => {
  it("laisse les flèches de réordonnancement et l'étoile actives quand aucune sauvegarde n'est en cours", () => {
    setup({ savingProfile: false });
    expect(screen.getByLabelText("Déplacer la photo vers la droite")).not.toBeDisabled();
    expect(screen.getAllByLabelText("Définir comme photo principale")[0]).not.toBeDisabled();
    screen.getAllByLabelText("Supprimer la photo").forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it("désactive les flèches, l'étoile et la suppression de photo pendant savingProfile", () => {
    setup({ savingProfile: true });
    // Photo du milieu (i=1) : a une flèche vers la gauche ET vers la droite.
    expect(screen.getByLabelText("Déplacer la photo vers la gauche")).toBeDisabled();
    expect(screen.getByLabelText("Déplacer la photo vers la droite")).toBeDisabled();
    screen.getAllByLabelText("Définir comme photo principale").forEach((btn) => expect(btn).toBeDisabled());
    screen.getAllByLabelText("Supprimer la photo").forEach((btn) => expect(btn).toBeDisabled());
  });

  it("un clic sur la flèche pendant savingProfile ne déclenche pas moveExistingPhoto", async () => {
    const user = userEvent.setup();
    const { moveExistingPhoto } = setup({ savingProfile: true });
    await user.click(screen.getByLabelText("Déplacer la photo vers la droite"));
    expect(moveExistingPhoto).not.toHaveBeenCalled();
  });
});
