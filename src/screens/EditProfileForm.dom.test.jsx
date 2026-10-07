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

// La préparation (validation + réduction + aperçu) est testée dans
// src/lib/prepareImageSelection.test.js : ici on vérifie seulement que le
// formulaire s'en sert pour la couverture.
const prepareMock = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../lib/prepareImageSelection", () => ({ prepareImageSelection: (...a) => prepareMock.fn(...a) }));

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

// Bug corrigé à l'audit changement de prénom (App.jsx:handleSaveProfile) :
// le garde serveur `!editForm.name` ne bloquait pas un prénom "espace seul"
// (" " est "truthy" en JS) — seul ce bouton désactivé (profileValid, qui
// utilise bien .trim()) empêchait réellement ce cas en pratique. On fige ici
// ce comportement pour qu'une régression future (ex. un profileValid qui
// perdrait son .trim()) soit détectée côté UI, en plus du garde .trim()
// ajouté dans App.jsx.
describe("EditProfileForm — validation du prénom", () => {
  it("désactive « Enregistrer » quand le prénom est vide", () => {
    setup({ editForm: { ...baseEditForm, name: "" } });
    expect(screen.getByRole("button", { name: /Enregistrer/ })).toBeDisabled();
  });

  it("désactive « Enregistrer » quand le prénom ne contient que des espaces", () => {
    setup({ editForm: { ...baseEditForm, name: "   " } });
    expect(screen.getByRole("button", { name: /Enregistrer/ })).toBeDisabled();
  });

  it("active « Enregistrer » pour un prénom valide", () => {
    setup({ editForm: { ...baseEditForm, name: "Awa" } });
    expect(screen.getByRole("button", { name: /Enregistrer/ })).not.toBeDisabled();
  });
});

// Audit médias mobiles (6 oct. 2026) : la couverture partait en aperçu (data URL)
// depuis l'ORIGINAL de plusieurs Mo, sans retrait du GPS avant l'upload final.
describe("EditProfileForm — photo de couverture et photos en cours de préparation", () => {
  function coverInput(container) {
    return container.querySelectorAll('input[type="file"]')[0];
  }

  it("la couverture choisie est celle réduite par prepareImageSelection, avec son aperçu léger", async () => {
    const user = userEvent.setup();
    const reduced = new File(["small"], "cover.jpg", { type: "image/jpeg" });
    prepareMock.fn.mockResolvedValue([{ file: reduced, preview: "data:image/jpeg;base64,PETIT" }]);
    const { container, setCoverFile, setCoverPreview, setCoverRemoved } = setup();
    const original = new File(["x".repeat(2000)], "IMG_0001.HEIC", { type: "image/heic" });
    await user.upload(coverInput(container), original);
    expect(prepareMock.fn).toHaveBeenCalledWith([original], expect.objectContaining({ maxDimension: 1280 }));
    await vi.waitFor(() => expect(setCoverFile).toHaveBeenCalledWith(reduced));
    expect(setCoverPreview).toHaveBeenCalledWith("data:image/jpeg;base64,PETIT");
    expect(setCoverRemoved).toHaveBeenCalledWith(false);
  });

  it("couverture refusée : rien n'est modifié (l'erreur est remontée par prepareImageSelection)", async () => {
    const user = userEvent.setup();
    prepareMock.fn.mockResolvedValue([]);
    const { container, setCoverFile, setCoverPreview } = setup();
    await user.upload(coverInput(container), new File(["x"], "a.png", { type: "image/png" }));
    await vi.waitFor(() => expect(prepareMock.fn).toHaveBeenCalled());
    expect(setCoverFile).not.toHaveBeenCalled();
    expect(setCoverPreview).not.toHaveBeenCalled();
  });

  it("pendant la préparation de photos : sélecteur désactivé et libellé « Préparation… »", () => {
    const { container } = setup({ photosPreparing: true });
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs[inputs.length - 1]).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Préparation…");
  });
});

// Audit de régression médias mobile (6 oct. 2026) : handleSaveProfile capture
// newPhotoFiles/coverFile dans une closure ; enregistrer pendant la préparation
// d'une photo la faisait disparaître sans message.
describe("EditProfileForm — enregistrement pendant la préparation des photos", () => {
  it("désactive « Enregistrer » tant que des photos se préparent", () => {
    setup({ photosPreparing: true });
    expect(screen.getByRole("button", { name: /Préparation des photos/ })).toBeDisabled();
  });

  it("désactive « Enregistrer » pendant la préparation de la couverture, puis le réactive", async () => {
    let finish;
    prepareMock.fn.mockImplementation(() => new Promise((r) => { finish = r; }));
    const { container } = setup({});
    const input = container.querySelector('input[type="file"]');
    const file = new File([new Uint8Array(4)], "c.jpg", { type: "image/jpeg" });
    await userEvent.upload(input, file);
    expect(screen.getByRole("button", { name: /Préparation des photos/ })).toBeDisabled();
    finish([{ file, preview: "data:x" }]);
    expect(await screen.findByRole("button", { name: /Enregistrer/ })).toBeEnabled();
  });
});
