import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Étape 3b : bouton « Prendre une photo » (natif seulement) et son branchement sur les trois
// sites retenus (onboarding, édition de profil, statuts). Le web ne doit rien voir de nouveau.

const mocks = vi.hoisted(() => ({
  native: true,
  platform: "android",
  perm: "granted",
  takePhoto: vi.fn(),
}));
vi.mock("../lib/platform", () => ({ isNative: () => mocks.native, getPlatform: () => mocks.platform }));
vi.mock("../lib/nativeCamera", async () => {
  const actual = await vi.importActual("../lib/nativeCamera");
  return {
    ...actual,
    checkCameraPermission: async () => (mocks.native ? mocks.perm : null),
    takePhoto: (...a) => mocks.takePhoto(...a),
  };
});
vi.mock("../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

import NativeCameraButton from "./NativeCameraButton";
import Step2Photo from "../screens/onboarding/steps/Step2Photo";
import EditProfileForm from "../screens/EditProfileForm";
import StoryComposerModal from "./social/StoryComposerModal";

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo-1.jpg", { type: "image/jpeg" });

beforeEach(() => {
  mocks.native = true; mocks.platform = "android"; mocks.perm = "granted";
  mocks.takePhoto.mockReset();
});

describe("NativeCameraButton", () => {
  it("web : ne rend strictement rien", () => {
    mocks.native = false;
    const { container } = render(<NativeCameraButton onFile={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("permission accordée : ouvre l'appareil photo directement et remet le File", async () => {
    const f = photo();
    mocks.takePhoto.mockResolvedValue({ ok: true, file: f });
    const onFile = vi.fn();
    render(<NativeCameraButton onFile={onFile} />);
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    await waitFor(() => expect(onFile).toHaveBeenCalledWith(f));
    expect(mocks.takePhoto).toHaveBeenCalledTimes(1);
  });

  it("permission pas encore demandée : explication AVANT la fenêtre système, puis « Continuer »", async () => {
    mocks.perm = "prompt";
    const f = photo();
    mocks.takePhoto.mockResolvedValue({ ok: true, file: f });
    const onFile = vi.fn();
    render(<NativeCameraButton onFile={onFile} />);
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    expect(await screen.findByText(/a besoin de ton appareil photo/)).toBeInTheDocument();
    expect(mocks.takePhoto).not.toHaveBeenCalled(); // rien de système tant que l'utilisateur n'a pas continué
    await userEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await waitFor(() => expect(onFile).toHaveBeenCalledWith(f));
  });

  it("« Pas maintenant » : ferme l'explication sans rien ouvrir", async () => {
    mocks.perm = "prompt";
    render(<NativeCameraButton onFile={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pas maintenant" }));
    expect(screen.queryByText(/a besoin de ton appareil photo/)).toBeNull();
    expect(mocks.takePhoto).not.toHaveBeenCalled();
  });

  it("refus définitif : message honnête + chemin des réglages, sans rien ouvrir", async () => {
    mocks.perm = "denied";
    render(<NativeCameraButton onFile={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Réglages, Applications, Baobab, Autorisations, Appareil photo");
    expect(mocks.takePhoto).not.toHaveBeenCalled();
  });

  it("annulation : retour silencieux, aucun message d'erreur, aucun File", async () => {
    mocks.takePhoto.mockResolvedValue({ ok: false, code: "CANCELLED" });
    const onFile = vi.fn();
    render(<NativeCameraButton onFile={onFile} />);
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    await waitFor(() => expect(mocks.takePhoto).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onFile).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Prendre une photo" })).not.toBeDisabled());
  });

  it("refus renvoyé par la prise de photo : panneau de refus ; autre erreur : message générique", async () => {
    mocks.takePhoto.mockResolvedValueOnce({ ok: false, code: "PERMISSION_DENIED", message: "Accès refusé : réglages X" });
    render(<NativeCameraButton onFile={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Accès refusé : réglages X");
    await userEvent.click(screen.getByRole("button", { name: "Compris" }));
    mocks.takePhoto.mockResolvedValueOnce({ ok: false, code: "ERROR", message: "Impossible d'ouvrir l'appareil photo pour le moment." });
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible d'ouvrir l'appareil photo");
  });

  it("un seul appareil photo ouvert à la fois (double appui)", async () => {
    let resolve;
    mocks.takePhoto.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<NativeCameraButton onFile={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Prendre une photo" });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(mocks.takePhoto).toHaveBeenCalledTimes(1);
    resolve({ ok: false, code: "CANCELLED" });
  });

  it("désactivé (préparation en cours) : bouton inactif", () => {
    render(<NativeCameraButton onFile={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Prendre une photo" })).toBeDisabled();
  });
});

describe("branchement : onboarding (Step2Photo)", () => {
  const baseProps = { photoPreviews: [], removePhotoFile: vi.fn(), existingAvatarUrl: null };
  it("natif : la photo prise passe par handlePhotosSelected (même chemin que le sélecteur)", async () => {
    const f = photo();
    mocks.takePhoto.mockResolvedValue({ ok: true, file: f });
    const handlePhotosSelected = vi.fn();
    render(<Step2Photo {...baseProps} handlePhotosSelected={handlePhotosSelected} />);
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    await waitFor(() => expect(handlePhotosSelected).toHaveBeenCalledTimes(1));
    const event = handlePhotosSelected.mock.calls[0][0];
    expect(Array.from(event.target.files)).toEqual([f]);
    // Le sélecteur existant « + Ajouter » est toujours là (galerie, sélection multiple).
    expect(screen.getByText("+ Ajouter")).toBeInTheDocument();
  });
  it("web : aucun bouton « Prendre une photo », « + Ajouter » inchangé", () => {
    mocks.native = false;
    render(<Step2Photo {...baseProps} handlePhotosSelected={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Prendre une photo" })).toBeNull();
    expect(screen.getByText("+ Ajouter")).toBeInTheDocument();
  });
  it("natif : masqué quand le maximum de photos est atteint", () => {
    render(<Step2Photo {...baseProps} photoPreviews={new Array(10).fill("data:x")} handlePhotosSelected={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Prendre une photo" })).toBeNull();
  });
  it("natif : désactivé pendant la préparation des photos", () => {
    render(<Step2Photo {...baseProps} photosPreparing handlePhotosSelected={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Prendre une photo" })).toBeDisabled();
  });
});

describe("branchement : édition de profil", () => {
  const editForm = { name: "Awa", lastName: "", birthDate: "1995-01-01", age: 30, languagesDetail: [], lookingFor: [], relationshipValues: [], interests: [], relationshipNeeds: [], bio: "" };
  const renderForm = (extra = {}) => {
    const handleNewPhotosSelected = vi.fn();
    render(
      <EditProfileForm
        editForm={editForm} coverPreview="" currentUser={{ id: "u1" }} coverRemoved={false}
        existingPhotos={[{ id: "p1", url: "https://x/p1.jpg", position: 0 }]} newPhotoPreviews={[]} savingProfile={false}
        setView={vi.fn()} setEditForm={vi.fn()} setCoverFile={vi.fn()} setCoverPreview={vi.fn()} setCoverRemoved={vi.fn()}
        removeExistingPhoto={vi.fn()} moveExistingPhoto={vi.fn()} setPrimaryPhoto={vi.fn()} removeNewPhotoFile={vi.fn()}
        handleNewPhotosSelected={handleNewPhotosSelected} handleSaveProfile={vi.fn()} onError={vi.fn()} {...extra}
      />
    );
    return { handleNewPhotosSelected };
  };
  it("natif : la photo prise est ajoutée via handleNewPhotosSelected", async () => {
    const f = photo();
    mocks.takePhoto.mockResolvedValue({ ok: true, file: f });
    const { handleNewPhotosSelected } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Prendre une photo" }));
    await waitFor(() => expect(handleNewPhotosSelected).toHaveBeenCalledTimes(1));
    expect(Array.from(handleNewPhotosSelected.mock.calls[0][0].target.files)).toEqual([f]);
  });
  it("web : pas de bouton ajouté", () => {
    mocks.native = false;
    renderForm();
    expect(screen.queryByRole("button", { name: "Prendre une photo" })).toBeNull();
  });
  it("natif : désactivé pendant l'enregistrement", () => {
    renderForm({ savingProfile: true });
    expect(screen.getByRole("button", { name: "Prendre une photo" })).toBeDisabled();
  });
});

describe("branchement : statuts (StoryComposerModal)", () => {
  const renderStory = (extra = {}) => {
    const onStoryMediaSelected = vi.fn();
    const utils = render(
      <StoryComposerModal
        storyComposer setStoryComposer={vi.fn()} storyText="" setStoryText={vi.fn()} storyMedia={null} setStoryMedia={vi.fn()}
        storyMediaKind="" setStoryMediaKind={vi.fn()} storyMediaError="" storyMediaWarning="" storyUploading={false}
        storyUploadProgress={0} storyBgColor="" setStoryBgColor={vi.fn()} storyStep="compose" setStoryStep={vi.fn()}
        pickStoryMedia={vi.fn()} onStoryMediaSelected={onStoryMediaSelected}
        storyPhotoInputRef={{ current: null }} storyVideoInputRef={{ current: null }} addStory={vi.fn()} {...extra}
      />
    );
    return { onStoryMediaSelected, ...utils };
  };
  it("natif : « Prendre une photo » appelle onStoryMediaSelected(event, \"photo\") avec le File", async () => {
    const f = photo();
    mocks.takePhoto.mockResolvedValue({ ok: true, file: f });
    const { onStoryMediaSelected } = renderStory();
    await userEvent.click(screen.getByRole("button", { name: /Prendre une photo/ }));
    await waitFor(() => expect(onStoryMediaSelected).toHaveBeenCalledTimes(1));
    const [event, kind] = onStoryMediaSelected.mock.calls[0];
    expect(kind).toBe("photo");
    expect(Array.from(event.target.files)).toEqual([f]);
  });
  it("web : aucun bouton (DOM du composeur inchangé)", () => {
    mocks.native = false;
    renderStory();
    expect(screen.queryByRole("button", { name: /Prendre une photo/ })).toBeNull();
  });
  it("natif : masqué quand un média est déjà joint", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    renderStory({ storyMedia: photo(), storyMediaKind: "photo" });
    expect(screen.queryByRole("button", { name: /Prendre une photo/ })).toBeNull();
  });
});
