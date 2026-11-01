import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let resolveInsert;
vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: () => ({
      insert: () => new Promise((res) => { resolveInsert = () => res({ error: null }); }),
    }),
  },
}));

import BetaFeedbackModal from "./BetaFeedbackModal";

// Même famille que ReportModal : fermer pendant l'envoi laissait l'envoi
// repasser `submitted` à true sur une modale rouverte ensuite.
describe("BetaFeedbackModal — fermeture pendant l'envoi", () => {
  it("ignore fond / Annuler / Échap tant que l'envoi est en vol, puis referme normalement", async () => {
    const onClose = vi.fn();
    render(<BetaFeedbackModal open onClose={onClose} currentUser={{ id: "u1" }} screen="home" />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Un bug" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await screen.findByText("Envoi...");

    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    resolveInsert();
    const fermer = await screen.findByRole("button", { name: "Fermer" });
    await waitFor(() => expect(screen.getByText("Merci !")).toBeTruthy());
    fireEvent.click(fermer);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
