import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportModal from "./ReportModal";

// Modale de signalement contrôlée (category/reason remontent au parent).
// Sensible : rendu conditionnel sur `target`, motif requis avant envoi,
// bouton « Envoyer » en .bb-btn-danger, option « Bloquer aussi » après
// envoi, Échap ferme (sauf pendant l'envoi).

function Harness({ target = { name: "Alex" }, onSubmit, onCancel, onBlockAlso, onDismissAfterSubmit, ...props }) {
  const [category, setCategory] = React.useState("");
  const [reason, setReason] = React.useState("");
  return (
    <ReportModal
      target={target}
      category={category}
      setCategory={setCategory}
      reason={reason}
      setReason={setReason}
      onSubmit={onSubmit || (() => {})}
      onCancel={onCancel || (() => {})}
      onBlockAlso={onBlockAlso}
      onDismissAfterSubmit={onDismissAfterSubmit || (() => {})}
      {...props}
    />
  );
}

describe("ReportModal", () => {
  it("ne rend rien sans target", () => {
    const { container } = render(<Harness target={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("rendu : titre avec le nom de la cible et bouton Envoyer en .bb-btn-danger", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "Signaler Alex" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Envoyer" })).toHaveClass("bb-btn-danger");
  });

  it("targetLabel prime sur target.name", () => {
    render(<Harness targetLabel="ce profil" />);
    expect(screen.getByRole("heading", { name: "Signaler ce profil" })).toBeInTheDocument();
  });

  it("Envoyer est désactivé tant qu'aucun motif n'est choisi, activé après", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const send = screen.getByRole("button", { name: "Envoyer" });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Spam" }));
    expect(send).toBeEnabled();
    await user.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("motif « Autre » exige un commentaire avant de pouvoir envoyer", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Autre" }));
    const send = screen.getByRole("button", { name: "Envoyer" });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "Comportement déplacé");
    expect(send).toBeEnabled();
  });

  it("pendant l'envoi : bouton « Envoi... » désactivé, Annuler désactivé", () => {
    render(<Harness sending />);
    expect(screen.getByRole("button", { name: "Envoi..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
  });

  it("après envoi (submitted) sans onBlockAlso : écran de remerciement + Fermer", async () => {
    const user = userEvent.setup();
    const onDismissAfterSubmit = vi.fn();
    render(<Harness submitted onDismissAfterSubmit={onDismissAfterSubmit} />);
    expect(screen.getByRole("heading", { name: "Signalement envoyé" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onDismissAfterSubmit).toHaveBeenCalledTimes(1);
  });

  it("après envoi avec onBlockAlso : propose de bloquer, le bouton appelle onBlockAlso(target)", async () => {
    const user = userEvent.setup();
    const onBlockAlso = vi.fn();
    const target = { name: "Alex", id: "u1" };
    render(<Harness target={target} submitted onBlockAlso={onBlockAlso} />);
    expect(screen.getByText(/Veux-tu aussi bloquer Alex/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bloquer" }));
    expect(onBlockAlso).toHaveBeenCalledWith(target);
  });

  it("Échap ferme via onCancel quand on n'envoie pas", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Échap ne ferme pas pendant l'envoi (course évitée)", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} sending />);
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
