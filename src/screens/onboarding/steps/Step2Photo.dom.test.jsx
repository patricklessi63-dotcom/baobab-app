import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Step2Photo, { isStep2Valid } from "./Step2Photo";
import { MAX_PHOTOS } from "../../../constants";

// L'état "upload en cours désactive Suivant" vit dans OnboardingWizard
// (bouton `disabled={!currentValid || saving}`), pas dans ce composant qui
// ne gère que la liste des aperçus. On teste donc la validité (isStep2Valid)
// et le rendu de la galerie.

describe("isStep2Valid", () => {
  it("faux sans aucune photo ni avatar existant", () => {
    expect(isStep2Valid([], false)).toBe(false);
  });
  it("vrai dès qu'un aperçu est présent", () => {
    expect(isStep2Valid(["blob:1"], false)).toBe(true);
  });
  it("vrai si une photo est déjà enregistrée en base (retour arrière)", () => {
    expect(isStep2Valid([], true)).toBe(true);
  });
});

describe("Step2Photo (composant)", () => {
  const noop = () => {};

  it("affiche l'avatar déjà enregistré quand aucun aperçu local", () => {
    render(
      <Step2Photo
        photoPreviews={[]}
        handlePhotosSelected={noop}
        removePhotoFile={noop}
        existingAvatarUrl="https://x/avatar.jpg"
      />
    );
    expect(screen.getByAltText("Photo déjà enregistrée")).toBeInTheDocument();
    expect(screen.getByText("Déjà enregistrée")).toBeInTheDocument();
  });

  it("masque l'avatar existant dès qu'un aperçu local est choisi", () => {
    render(
      <Step2Photo
        photoPreviews={["blob:a"]}
        handlePhotosSelected={noop}
        removePhotoFile={noop}
        existingAvatarUrl="https://x/avatar.jpg"
      />
    );
    expect(screen.queryByAltText("Photo déjà enregistrée")).not.toBeInTheDocument();
    expect(screen.getByAltText("Photo 1")).toBeInTheDocument();
    expect(screen.getByText("Principale")).toBeInTheDocument();
  });

  it("le bouton de retrait appelle removePhotoFile avec l'index", async () => {
    const user = userEvent.setup();
    const removePhotoFile = vi.fn();
    render(
      <Step2Photo
        photoPreviews={["blob:a", "blob:b"]}
        handlePhotosSelected={noop}
        removePhotoFile={removePhotoFile}
        existingAvatarUrl={null}
      />
    );
    const removeButtons = screen.getAllByLabelText("Supprimer cette photo");
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[1]);
    expect(removePhotoFile).toHaveBeenCalledWith(1);
  });

  it("le champ d'ajout disparaît quand MAX_PHOTOS est atteint", () => {
    const full = Array.from({ length: MAX_PHOTOS }, (_, i) => `blob:${i}`);
    const { rerender } = render(
      <Step2Photo photoPreviews={full} handlePhotosSelected={noop} removePhotoFile={noop} existingAvatarUrl={null} />
    );
    expect(screen.queryByText("+ Ajouter")).not.toBeInTheDocument();
    rerender(
      <Step2Photo photoPreviews={full.slice(1)} handlePhotosSelected={noop} removePhotoFile={noop} existingAvatarUrl={null} />
    );
    expect(screen.getByText("+ Ajouter")).toBeInTheDocument();
  });

  it("sélectionner des fichiers déclenche handlePhotosSelected", async () => {
    const user = userEvent.setup();
    const handlePhotosSelected = vi.fn();
    const { container } = render(
      <Step2Photo photoPreviews={[]} handlePhotosSelected={handlePhotosSelected} removePhotoFile={noop} existingAvatarUrl={null} />
    );
    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "photo.png", { type: "image/png" });
    await user.upload(input, file);
    expect(handlePhotosSelected).toHaveBeenCalledTimes(1);
  });
});
