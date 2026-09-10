import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BlockConfirmModal from "./BlockConfirmModal";

// BlockConfirmModal : rendu piloté par `target` (objet {name} ou null),
// libellé figé « Bloquer <nom> », bouton d'action danger, Échap ferme.

function setup(props) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(
    <BlockConfirmModal
      target={{ id: "u1", name: "Awa" }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel, ...utils };
}

describe("BlockConfirmModal", () => {
  it("ne rend rien sans target", () => {
    const { container } = render(
      <BlockConfirmModal target={null} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche le libellé « Bloquer <nom> ? » et l'aria-label du dialog", () => {
    setup();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Bloquer Awa");
    expect(screen.getByRole("heading", { name: "Bloquer Awa ?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bloquer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
  });

  it("le bouton d'action porte .bb-btn-danger", () => {
    setup();
    expect(screen.getByRole("button", { name: "Bloquer" })).toHaveClass("bb-btn-danger");
  });

  it("clic Bloquer appelle onConfirm avec la target", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Bloquer" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ id: "u1", name: "Awa" });
  });

  it("clic Annuler appelle onCancel", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Échap ferme via onCancel", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("pendant le blocage en cours, le libellé passe à « Blocage... » et les boutons sont désactivés", async () => {
    const user = userEvent.setup();
    let resolve;
    const onConfirm = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(<BlockConfirmModal target={{ id: "u1", name: "Awa" }} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Bloquer" }));
    expect(screen.getByRole("button", { name: "Blocage..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
    resolve();
  });
});
