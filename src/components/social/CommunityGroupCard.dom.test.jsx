import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommunityGroupCard from "./CommunityGroupCard";

// Carte cliquable contenant elle-même un bouton d'action : <div role="button">
// pour éviter un <button> imbriqué. Le clavier (Enter/Espace) ne doit activer
// onView que quand le focus est sur la carte, pas sur le bouton interne ;
// « Rejoindre » appelle onJoin et stoppe la propagation (pas d'ouverture).

const base = {
  community: { id: "c1", name: "Diaspora MTL", category: "culture", visibility: "public", city: "Montréal" },
  memberCount: 3,
};

function setup(props) {
  const onView = vi.fn();
  const onJoin = vi.fn();
  const utils = render(
    <CommunityGroupCard {...base} onView={onView} onJoin={onJoin} {...props} />
  );
  return { onView, onJoin, ...utils };
}

describe("CommunityGroupCard", () => {
  it("expose role=button et est focusable", () => {
    setup();
    const card = screen.getByRole("button", { name: /Diaspora MTL/ });
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("clic sur la carte appelle onView", async () => {
    const user = userEvent.setup();
    const { onView } = setup();
    await user.click(screen.getByRole("button", { name: /Diaspora MTL/ }));
    expect(onView).toHaveBeenCalledWith(base.community);
  });

  it("Enter et Espace sur la carte (focus carte) appellent onView", () => {
    const { onView } = setup();
    const card = screen.getByRole("button", { name: /Diaspora MTL/ });
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onView).toHaveBeenCalledTimes(2);
  });

  it("Enter sur le bouton interne « Rejoindre » n'appelle PAS onView", () => {
    const { onView } = setup();
    const joinBtn = screen.getByRole("button", { name: "Rejoindre" });
    fireEvent.keyDown(joinBtn, { key: "Enter" });
    expect(onView).not.toHaveBeenCalled();
  });

  it("clic sur « Rejoindre » appelle onJoin et stoppe la propagation (onView non appelé)", async () => {
    const user = userEvent.setup();
    const { onView, onJoin } = setup();
    await user.click(screen.getByRole("button", { name: "Rejoindre" }));
    expect(onJoin).toHaveBeenCalledWith(base.community);
    expect(onView).not.toHaveBeenCalled();
  });

  it("communauté privée : bouton « Demander à rejoindre »", () => {
    setup({ community: { ...base.community, visibility: "private" } });
    expect(screen.getByRole("button", { name: "Demander à rejoindre" })).toBeInTheDocument();
  });

  it("déjà membre : badge « Membre », aucun bouton d'action", () => {
    setup({ joined: true });
    expect(screen.getByText("Membre")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rejoindre/ })).toBeNull();
  });

  it("sur invitation : mention « Sur invitation », aucun bouton d'action", () => {
    setup({ community: { ...base.community, visibility: "invite_only" } });
    expect(screen.getByText("Sur invitation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rejoindre/ })).toBeNull();
  });

  it("demande en attente : mention « Demande envoyée »", () => {
    setup({ pending: true });
    expect(screen.getByText("Demande envoyée")).toBeInTheDocument();
  });
});
