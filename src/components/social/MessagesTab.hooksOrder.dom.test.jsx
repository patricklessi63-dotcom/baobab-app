import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./ConversationPane", () => ({ default: () => <div>pane</div> }));

import MessagesTab from "./MessagesTab";

// Régression (561ed64, 1er novembre 2026) : useKeyboardViewport était appelé APRÈS le retour anticipé de
// la liste vide. Passer de 1 conversation à 0 (blocage de sa seule conversation, onglet Messages ouvert)
// ou de 0 à 1 (première connexion reçue en direct) changeait le nombre de hooks entre deux rendus :
// React plantait l'écran (« Rendered fewer/more hooks than expected »). Détecté par le linter
// (react-hooks/rules-of-hooks).

const base = { currentUser: { id: "u1" }, goTab: vi.fn(), onSelectMatch: vi.fn(), messages: [] };
const alice = { id: "u2", name: "Alice" };

describe("MessagesTab — nombre de hooks stable quand la liste se vide ou se remplit", () => {
  it("1 conversation → 0 : affiche l'état vide sans planter", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<MessagesTab {...base} matches={[alice]} activeMatch={null} />);
    expect(() => rerender(<MessagesTab {...base} matches={[]} activeMatch={null} />)).not.toThrow();
    expect(screen.getByText("Tes conversations apparaîtront ici.")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("0 conversation → 1 : affiche la liste sans planter", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<MessagesTab {...base} matches={[]} activeMatch={null} />);
    expect(() => rerender(<MessagesTab {...base} matches={[alice]} activeMatch={null} />)).not.toThrow();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    spy.mockRestore();
  });
});
