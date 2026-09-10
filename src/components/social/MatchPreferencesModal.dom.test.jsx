import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MatchPreferencesModal from "./MatchPreferencesModal";

// Modale « Mes préférences » de matching. Sensible : hydratation depuis
// currentUser à l'ouverture, édition d'un champ, Enregistrer -> onSave avec
// le bon payload + onClose, validation de la tranche d'âge, Échap.

const currentUser = {
  pref_age_min: 25,
  pref_age_max: 40,
  pref_distance: "Peu importe",
  pref_looking_for: "🤝 Amitié, ☕ Sorties",
};

function setup(props) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const utils = render(
    <MatchPreferencesModal open onClose={onClose} onSave={onSave} currentUser={currentUser} {...props} />
  );
  return { onClose, onSave, ...utils };
}

describe("MatchPreferencesModal", () => {
  it("ne rend rien quand open est falsy", () => {
    const { container } = render(
      <MatchPreferencesModal open={false} onClose={vi.fn()} onSave={vi.fn()} currentUser={currentUser} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hydrate les champs depuis currentUser à l'ouverture", () => {
    setup();
    expect(screen.getByLabelText("Âge minimum")).toHaveValue(25);
    expect(screen.getByLabelText("Âge maximum")).toHaveValue(40);
    expect(screen.getByRole("button", { name: "Peu importe" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "🤝 Amitié" })).toHaveAttribute("aria-pressed", "true");
  });

  it("valeurs par défaut quand currentUser est vide", () => {
    render(<MatchPreferencesModal open onClose={vi.fn()} onSave={vi.fn()} currentUser={{}} />);
    expect(screen.getByLabelText("Âge minimum")).toHaveValue(18);
    expect(screen.getByLabelText("Âge maximum")).toHaveValue(99);
  });

  it("Enregistrer appelle onSave avec le payload mappé puis onClose", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = setup();
    const min = screen.getByLabelText("Âge minimum");
    await user.clear(min);
    await user.type(min, "30");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      pref_age_min: 30,
      pref_age_max: 40,
      pref_distance: "Peu importe",
      pref_looking_for: "🤝 Amitié, ☕ Sorties",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("tranche d'âge invalide : message d'erreur, onSave non appelé", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    const min = screen.getByLabelText("Âge minimum");
    await user.clear(min);
    await user.type(min, "10");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/tranche d'âge valide/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("modifier un curseur de distance met à jour la sélection", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    await user.click(screen.getByRole("button", { name: "Ma ville uniquement" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ pref_distance: "Ma ville uniquement" })
    );
  });

  it("Échap appelle onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("le bouton Fermer (X) appelle onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
