import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileMenu from "./ProfileMenu";

// Menu déroulant du profil du header de SocialShell.jsx, extrait tel quel
// (voir commentaire en tête de ProfileMenu.jsx) — pas de logique propre,
// seulement le câblage props → JSX. Les tests couvrent le rendu de base
// (nom/ville, tous les liens), les pastilles de badge conditionnelles, le
// lien admin conditionnel, et quelques interactions représentatives.

function baseProps(overrides) {
  return {
    currentUser: { name: "Awa", city: "Montréal" },
    goTab: vi.fn(),
    communitiesBadgeCount: 0,
    eventsBadgeCount: 0,
    setMenu: vi.fn(),
    openEditProfile: vi.fn(),
    setSettingsOpen: vi.fn(),
    updateAvailable: false,
    myPlatformRole: null,
    setFeedbackOpen: vi.fn(),
    handleSignOut: vi.fn(),
    ...overrides,
  };
}

function setup(overrides) {
  const props = baseProps(overrides);
  const utils = render(<ProfileMenu {...props} />);
  return { props, ...utils };
}

describe("ProfileMenu", () => {
  it("rend le nom/ville de l'utilisateur et tous les liens de base", () => {
    setup();
    expect(screen.getByText("Awa")).toBeInTheDocument();
    expect(screen.getByText(/Montréal/)).toBeInTheDocument();
    ["Mon profil", "Découvrir", "Communautés", "Événements", "Modifier mon profil", "Réglages", "Un souci, une idée ?", "Déconnexion"].forEach((label) => {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    });
  });

  it("nom/ville par défaut quand currentUser est vide", () => {
    setup({ currentUser: null });
    expect(screen.getByText("Ton profil")).toBeInTheDocument();
    expect(screen.getByText(/Canada/)).toBeInTheDocument();
  });

  it("lien « Baobab Admin » absent sans myPlatformRole, présent avec", () => {
    const { rerender } = setup();
    expect(screen.queryByRole("button", { name: /Baobab Admin/ })).toBeNull();
    rerender(<ProfileMenu {...baseProps({ myPlatformRole: "moderator" })} />);
    expect(screen.getByRole("button", { name: /Baobab Admin/ })).toBeInTheDocument();
  });

  it("clic sur « Mon profil » appelle goTab(\"profile\") sans fermer explicitement le menu", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: /Mon profil/ }));
    expect(props.goTab).toHaveBeenCalledWith("profile");
  });

  it("clic sur « Déconnexion » ferme le menu puis appelle handleSignOut", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: /Déconnexion/ }));
    expect(props.setMenu).toHaveBeenCalledWith(false);
    expect(props.handleSignOut).toHaveBeenCalledTimes(1);
  });

  it("clic sur « Réglages » ferme le menu et ouvre les réglages", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: /Réglages/ }));
    expect(props.setMenu).toHaveBeenCalledWith(false);
    expect(props.setSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("badge de mise à jour sur « Réglages » visible seulement si updateAvailable", () => {
    const { rerender } = setup({ updateAvailable: false });
    expect(screen.queryByLabelText("Mise à jour disponible")).toBeNull();
    rerender(<ProfileMenu {...baseProps({ updateAvailable: true })} />);
    expect(screen.getByLabelText("Mise à jour disponible")).toBeInTheDocument();
  });
});
