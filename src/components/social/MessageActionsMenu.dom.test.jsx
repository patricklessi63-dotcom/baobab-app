import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageActionsMenu from "./MessageActionsMenu";

// Exigence Apple 1.2 / Google Play (UGC) : le menu d'un message reçu doit
// permettre de le signaler (2 touches : ⋯ puis « Signaler ce message »).
function setup(props = {}) {
  const handlers = {
    onReact: vi.fn(),
    onReply: vi.fn(),
    onCopy: vi.fn(),
    onReport: vi.fn(),
    onDeleteForMe: vi.fn(),
    onDeleteForEveryone: vi.fn(),
    onClose: vi.fn(),
  };
  render(<MessageActionsMenu message={{ id: "m1", kind: "text", text: "salut" }} isMine={false} align="left" {...handlers} {...props} />);
  return handlers;
}

describe("MessageActionsMenu — signalement d'un message", () => {
  it("propose « Signaler ce message » sur un message reçu et appelle onReport puis ferme le menu", async () => {
    const h = setup();
    await userEvent.click(screen.getByRole("menuitem", { name: /Signaler ce message/ }));
    expect(h.onReport).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("ne propose pas de signaler son propre message", () => {
    setup({ isMine: true });
    expect(screen.queryByRole("menuitem", { name: /Signaler ce message/ })).not.toBeInTheDocument();
  });

  it("n'affiche rien si aucun gestionnaire de signalement n'est fourni", () => {
    setup({ onReport: undefined });
    expect(screen.queryByRole("menuitem", { name: /Signaler ce message/ })).not.toBeInTheDocument();
  });
});
