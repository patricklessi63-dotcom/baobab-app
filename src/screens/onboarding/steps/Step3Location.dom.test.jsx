import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Step3Location, { isStep3Valid } from "./Step3Location";

// Étape ville/localisation : pays d'origine + province + ville, tous requis.
// Trois champs texte libres (pas de <select> en cascade dans cette version).

function Harness({ initial = {}, onUpdate }) {
  const [draft, setDraft] = React.useState({ country: "", province: "", city: "", ...initial });
  const update = (patch) => {
    onUpdate?.(patch);
    setDraft((d) => ({ ...d, ...patch }));
  };
  return <Step3Location draft={draft} update={update} />;
}

describe("Step3Location (composant)", () => {
  it("rend les trois champs", () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText(/Sénégal/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex : Québec")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex : Montréal")).toBeInTheDocument();
  });

  it("chaque champ remonte sa valeur via update", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness onUpdate={onUpdate} />);
    await user.type(screen.getByPlaceholderText(/Sénégal/), "Haïti");
    expect(onUpdate).toHaveBeenLastCalledWith({ country: "Haïti" });
    await user.type(screen.getByPlaceholderText("Ex : Québec"), "Québec");
    expect(onUpdate).toHaveBeenLastCalledWith({ province: "Québec" });
    await user.type(screen.getByPlaceholderText("Ex : Montréal"), "Laval");
    expect(onUpdate).toHaveBeenLastCalledWith({ city: "Laval" });
  });

  it("les champs affichent les valeurs du draft", () => {
    render(<Harness initial={{ country: "Philippines", province: "Ontario", city: "Toronto" }} />);
    expect(screen.getByDisplayValue("Philippines")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ontario")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Toronto")).toBeInTheDocument();
  });

  it("chaque champ est plafonné à 80 caractères", () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText(/Sénégal/)).toHaveAttribute("maxlength", "80");
    expect(screen.getByPlaceholderText("Ex : Québec")).toHaveAttribute("maxlength", "80");
    expect(screen.getByPlaceholderText("Ex : Montréal")).toHaveAttribute("maxlength", "80");
  });
});

describe("isStep3Valid", () => {
  it("faux si l'un des trois champs manque (cascade requise)", () => {
    expect(isStep3Valid({ country: "Haïti", province: "Québec", city: "" })).toBe(false);
    expect(isStep3Valid({ country: "Haïti", province: "", city: "Laval" })).toBe(false);
    expect(isStep3Valid({ country: "", province: "Québec", city: "Laval" })).toBe(false);
    expect(isStep3Valid({ country: "   ", province: "Québec", city: "Laval" })).toBe(false);
  });
  it("vrai quand les trois sont renseignés", () => {
    expect(isStep3Valid({ country: "Haïti", province: "Québec", city: "Laval" })).toBe(true);
  });
});
