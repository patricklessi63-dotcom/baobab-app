import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { useEscapeKey } from "./useEscapeKey";

function Modal({ onClose }) {
  useEscapeKey(true, onClose);
  return <div role="dialog" />;
}

// Clavier IME (chinois, japonais, coréen) : Échap annule la composition en cours, il ne doit
// pas fermer en plus la modale ouverte.
describe("useEscapeKey — composition IME", () => {
  it("ignore Échap pendant une composition, ferme sur un Échap normal", () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} />);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }));
    expect(onClose).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
