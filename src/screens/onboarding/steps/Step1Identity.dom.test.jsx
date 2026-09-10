import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Step1Identity, { isStep1Valid } from "./Step1Identity";

// computeAge est couvert par des tests de logique pure ailleurs. Ici on
// vérifie le composant : bornes d'âge affichées, champs requis, remontée du
// draft via `update`, messages d'erreur.

const THIS_YEAR = new Date().getFullYear();

function Harness({ initial = {}, onUpdate }) {
  const [draft, setDraft] = React.useState({
    name: "",
    lastName: "",
    birthDate: "",
    ...initial,
  });
  const update = (patch) => {
    onUpdate?.(patch);
    setDraft((d) => ({ ...d, ...patch }));
  };
  return <Step1Identity draft={draft} update={update} />;
}

describe("Step1Identity (composant)", () => {
  it("saisir le prénom remonte { name } via update", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness onUpdate={onUpdate} />);
    await user.type(screen.getByPlaceholderText("Ton prénom"), "Awa");
    expect(onUpdate).toHaveBeenCalledWith({ name: "A" });
    expect(onUpdate).toHaveBeenLastCalledWith({ name: "Awa" });
  });

  it("le <select> Année est borné à THIS_YEAR - 18 au maximum", () => {
    render(<Harness />);
    const yearSelect = screen.getByLabelText("Année de naissance");
    const values = [...yearSelect.options]
      .map((o) => Number(o.value))
      .filter((n) => !Number.isNaN(n) && n > 0);
    expect(Math.max(...values)).toBe(THIS_YEAR - 18);
    expect(Math.min(...values)).toBe(THIS_YEAR - 100);
  });

  it("mois et jour sont désactivés tant qu'aucune année n'est choisie", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("Mois de naissance")).toBeDisabled();
    expect(screen.getByLabelText("Jour de naissance")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Année de naissance"), String(THIS_YEAR - 30));
    expect(screen.getByLabelText("Mois de naissance")).toBeEnabled();
    expect(screen.getByLabelText("Jour de naissance")).toBeEnabled();
  });

  it("saisir l'âge écrit une birthDate cohérente via update", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness onUpdate={onUpdate} />);
    await user.type(screen.getByPlaceholderText("Ex. 28"), "30");
    // dernier appel : année = THIS_YEAR - 30, mois/jour par défaut 01-01
    expect(onUpdate).toHaveBeenLastCalledWith({ birthDate: `${THIS_YEAR - 30}-01-01` });
  });

  it("âge < 18 : message de blocage affiché", () => {
    render(<Harness initial={{ birthDate: `${THIS_YEAR - 15}-01-01` }} />);
    expect(
      screen.getByText("Tu dois avoir au moins 18 ans pour utiliser Baobab.")
    ).toBeInTheDocument();
  });

  it("âge >= 18 : message rassurant, pas de message de blocage", () => {
    render(<Harness initial={{ birthDate: `${THIS_YEAR - 25}-06-15` }} />);
    expect(screen.getByText(/Âge affiché sur ton profil/)).toBeInTheDocument();
    expect(
      screen.queryByText("Tu dois avoir au moins 18 ans pour utiliser Baobab.")
    ).not.toBeInTheDocument();
  });

  it("âge > 100 : message « Vérifie ta date de naissance »", () => {
    render(<Harness initial={{ birthDate: `${THIS_YEAR - 150}-01-01` }} />);
    expect(screen.getByText("Vérifie ta date de naissance.")).toBeInTheDocument();
  });

  it("birthDate invalide : message « Choisis une date de naissance valide »", () => {
    render(<Harness initial={{ birthDate: "pas-une-date" }} />);
    expect(screen.getByText("Choisis une date de naissance valide.")).toBeInTheDocument();
  });

  it("aucun message d'âge tant que birthDate est vide", () => {
    render(<Harness />);
    expect(screen.queryByText("Choisis une date de naissance valide.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Tu dois avoir au moins 18 ans pour utiliser Baobab.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Âge affiché/)).not.toBeInTheDocument();
  });
});

describe("isStep1Valid", () => {
  it("faux sans prénom ou sans date", () => {
    expect(isStep1Valid({ name: "", birthDate: `${THIS_YEAR - 30}-01-01` })).toBe(false);
    expect(isStep1Valid({ name: "Awa", birthDate: "" })).toBe(false);
  });
  it("faux si âge < 18 ou > 100", () => {
    expect(isStep1Valid({ name: "Awa", birthDate: `${THIS_YEAR - 15}-01-01` })).toBe(false);
    expect(isStep1Valid({ name: "Awa", birthDate: `${THIS_YEAR - 120}-01-01` })).toBe(false);
  });
  it("vrai pour un prénom + une date d'un adulte", () => {
    expect(isStep1Valid({ name: "Awa", birthDate: `${THIS_YEAR - 30}-06-15` })).toBe(true);
  });
});
