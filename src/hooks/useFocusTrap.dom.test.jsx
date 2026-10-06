import React, { useRef } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useFocusTrap } from "./useFocusTrap";

function Modal({ autoFocusInput }) {
  const ref = useRef(null);
  useFocusTrap(true, ref);
  return (
    <div ref={ref} tabIndex={-1}>
      <button>Fermer</button>
      <input aria-label="champ" autoFocus={autoFocusInput} />
    </div>
  );
}

const nextFrame = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r())); });

describe("useFocusTrap — focus initial", () => {
  it("ne vole pas le focus à un champ déjà focalisé dans la modale (autoFocus)", async () => {
    render(<Modal autoFocusInput />);
    expect(screen.getByLabelText("champ")).toHaveFocus();
    await nextFrame();
    expect(screen.getByLabelText("champ")).toHaveFocus();
  });

  it("déplace le focus sur le premier élément focusable si rien n'est focalisé dans la modale", async () => {
    render(<Modal />);
    await nextFrame();
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();
  });
});
