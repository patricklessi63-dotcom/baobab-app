import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmModal from "./ConfirmModal";

// ConfirmModal remplace les window.confirm() dispersés (suppression de
// publication/commentaire/communauté...). Comportements sensibles : rendu
// conditionnel sur `open`, style du bouton d'action selon `danger`, câblage
// des callbacks, fermeture Échap (useEscapeKey) et clic hors panneau.

function setup(props) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmModal
      open
      title="Supprimer cette publication ?"
      message="Cette action est irréversible."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel, ...utils };
}

describe("ConfirmModal", () => {
  it("ne rend rien quand open est falsy", () => {
    const { container } = render(
      <ConfirmModal open={false} title="X" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("rend titre, message et libellés (défauts) quand open", () => {
    setup();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("heading", { name: "Supprimer cette publication ?" })
    ).toBeInTheDocument();
    expect(screen.getByText("Cette action est irréversible.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
  });

  it("libellés personnalisables", () => {
    setup({ confirmLabel: "Retirer", cancelLabel: "Garder" });
    expect(screen.getByRole("button", { name: "Retirer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Garder" })).toBeInTheDocument();
  });

  it("branche danger (défaut) : le bouton d'action porte .bb-btn-danger et aucun fond primary inline", () => {
    setup();
    const confirmBtn = screen.getByRole("button", { name: "Supprimer" });
    expect(confirmBtn).toHaveClass("bb-btn-danger");
    expect(confirmBtn.getAttribute("style") || "").not.toMatch(/background/);
  });

  it("branche non-danger : pas de .bb-btn-danger, fond primary inline appliqué", () => {
    setup({ danger: false, confirmLabel: "Confirmer" });
    const confirmBtn = screen.getByRole("button", { name: "Confirmer" });
    expect(confirmBtn).not.toHaveClass("bb-btn-danger");
    expect(confirmBtn.getAttribute("style") || "").toMatch(/background/);
  });

  it("clic Confirmer appelle onConfirm, clic Annuler appelle onCancel", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Échap ferme via onCancel (useEscapeKey)", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("clic sur le fond (overlay) appelle onCancel, clic dans le panneau non", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    // le panneau : on clique sur le titre, l'overlay ne doit pas se déclencher
    await user.click(screen.getByRole("heading", { name: /Supprimer/ }));
    expect(onCancel).not.toHaveBeenCalled();
    // l'overlay plein écran = parent du panneau (role dialog)
    await user.click(screen.getByRole("dialog"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("focus trap : le focus entre dans le panneau à l'ouverture", async () => {
    setup();
    const dialog = screen.getByRole("dialog");
    await vi.waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });
});
