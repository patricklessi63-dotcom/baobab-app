import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// PostComposerModal — composant de composition entièrement contrôlé (tout
// l'état vient des props, la logique vit dans PostsFeed). On couvre ici la
// surface UI sensible testable en isolation :
//  - rendu conditionnel sur `composer` ;
//  - bouton « Publier » désactivé si vide (canPublish) ;
//  - anti-double-clic : « Publier » désactivé pendant `publishing` ;
//  - croix « Fermer » verrouillée pendant l'insertion initiale du post
//    (closeLocked = publishing && !publishedPostId) ;
//  - écran de confirmation de sortie (exitConfirmOpen).

vi.mock("../../supabaseClient", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, auth: {} },
}));

import PostComposerModal from "./PostComposerModal";

function Harness(overrides = {}) {
  const props = {
    composer: true,
    onRequestClose: vi.fn(),
    currentUser: { id: "u1", name: "Alex", ai_suggestions_enabled: false },
    draft: "",
    setDraft: vi.fn(),
    mediaItems: [],
    uploadStates: {},
    publishing: false,
    publishedPostId: null,
    pickMedia: vi.fn(),
    onMediaSelected: vi.fn(),
    onFilesSelected: vi.fn(),
    onRemoveMediaItem: vi.fn(),
    onMoveMediaItem: vi.fn(),
    onRetryMediaItem: vi.fn(),
    photoInputRef: React.createRef(),
    videoInputRef: React.createRef(),
    publish: vi.fn(),
    exitConfirmOpen: false,
    onCancelExit: vi.fn(),
    onSaveDraft: vi.fn(),
    onDiscard: vi.fn(),
    draftSavedNotice: false,
    resumedDraft: false,
    onDiscardResumed: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<PostComposerModal {...props} />) };
}

beforeEach(() => vi.clearAllMocks());

describe("PostComposerModal", () => {
  it("ne rend pas la modale quand composer est falsy", () => {
    Harness({ composer: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("« Publier » désactivé quand le brouillon est vide et sans média", () => {
    Harness();
    expect(screen.getByRole("button", { name: "Publier" })).toBeDisabled();
  });

  it("« Publier » activé dès que le brouillon a du texte", () => {
    Harness({ draft: "Bonjour le monde" });
    expect(screen.getByRole("button", { name: "Publier" })).toBeEnabled();
  });

  it("« Publier » activé si au moins un média est joint (texte vide)", () => {
    Harness({ mediaItems: [{ id: "m1", kind: "photo", previewUrl: "blob:x" }] });
    expect(screen.getByRole("button", { name: "Publier" })).toBeEnabled();
  });

  it("pendant publishing : bouton « Publication... » désactivé, un clic n'appelle pas publish", () => {
    const { props } = Harness({ draft: "coucou", publishing: true });
    const btn = screen.getByRole("button", { name: /Publication/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(props.publish).not.toHaveBeenCalled();
  });

  it("croix « Fermer » verrouillée tant que le post n'est pas encore inséré (publishing && !publishedPostId)", () => {
    const { props } = Harness({ draft: "coucou", publishing: true, publishedPostId: null });
    const close = screen.getByRole("button", { name: "Fermer" });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    expect(props.onRequestClose).not.toHaveBeenCalled();
  });

  it("croix « Fermer » de nouveau active une fois le post inséré (publishedPostId connu)", () => {
    Harness({ publishing: true, publishedPostId: "p1" });
    expect(screen.getByRole("button", { name: "Fermer" })).toBeEnabled();
  });

  it("exitConfirmOpen : propose Enregistrer en brouillon / Abandonner / Annuler", () => {
    const { props } = Harness({ draft: "texte en cours", exitConfirmOpen: true });
    expect(screen.getByRole("button", { name: "Enregistrer en brouillon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abandonner" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abandonner" }));
    expect(props.onDiscard).toHaveBeenCalledTimes(1);
  });
});
