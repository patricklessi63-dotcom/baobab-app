import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UpdateNotice from "./UpdateNotice";

// Deux variantes : obligatoire (modal bloquant plein écran, aucune
// échappatoire) vs recommandée (carte non bloquante, fermable). Le cooldown
// / la persistance localStorage sont gérés en amont (App), pas dans ce
// composant purement présentiel.

describe("UpdateNotice", () => {
  it("ne rend rien si ni mandatory ni recommended", () => {
    const { container } = render(<UpdateNotice onReload={vi.fn()} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("variante obligatoire : alertdialog, pas de « Plus tard », bouton recharge", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    render(<UpdateNotice mandatory onReload={onReload} onDismiss={vi.fn()} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Mise à jour nécessaire" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plus tard" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mettre à jour" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("variante recommandée : role status, boutons recharge et « Plus tard »", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render(
      <UpdateNotice
        recommended
        info={{ latestVersion: "9.9.9", releaseNotes: ["A", "B", "C", "D", "E"] }}
        onReload={onReload}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Nouvelle version de Baobab")).toBeInTheDocument();
    // releaseNotes plafonnées à 4
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.queryByText("E")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mettre à jour" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("mandatory prime sur recommended", () => {
    render(<UpdateNotice mandatory recommended onReload={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
