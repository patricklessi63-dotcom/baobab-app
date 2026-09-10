import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// Test de fumée : vérifie que l'environnement jsdom + Testing Library +
// les matchers jest-dom sont bien câblés pour les fichiers `*.dom.test.jsx`.
describe("harness jsdom", () => {
  it("rend un composant React et applique les matchers jest-dom", () => {
    render(<button className="bb-btn-danger">Supprimer</button>);
    const btn = screen.getByRole("button", { name: "Supprimer" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass("bb-btn-danger");
  });
});
