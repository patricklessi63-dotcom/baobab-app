import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DeleteAccountPage from "./DeleteAccountPage";
import { RETENTION } from "../../legalContent";
import { SUPPORT_EMAIL } from "../../lib/contact";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");

describe("DeleteAccountPage", () => {
  let link;
  beforeEach(() => {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", "https://baobab-app-zeta.vercel.app/");
    document.head.appendChild(link);
    window.history.pushState({}, "", "/suppression-compte");
  });
  afterEach(() => { cleanup(); link.remove(); window.history.pushState({}, "", "/"); });

  it("explique le chemin réel dans l'application, le délai et ce qui est supprimé", () => {
    render(<DeleteAccountPage navigate={() => {}} />);
    expect(screen.getByRole("heading", { name: "Supprimer mon compte Baobab" })).toBeInTheDocument();
    const text = document.body.textContent;
    for (const label of ["Réglages", "Zone de danger", "Supprimer mon compte", "SUPPRIMER", `Programmer la suppression dans ${RETENTION.deletionGraceHours} heures`]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("annuler la suppression");
    expect(text).toContain("Ce qui est supprimé");
    expect(text).toContain("Ce qui peut subsister");
  });

  it("les libellés cités existent vraiment dans l'application (le chemin décrit n'est pas inventé)", () => {
    expect(read("src/components/social/ProfileMenu.jsx")).toContain("Réglages");
    const modals = read("src/components/AppModals.jsx");
    expect(modals).toContain("Zone de danger");
    expect(modals).toContain("Supprimer mon compte");
    const modal = read("src/components/DeleteAccountModal.jsx");
    expect(modal).toContain('=== "SUPPRIMER"');
    expect(modal).toContain("Programmer la suppression dans 24 heures");
    expect(read("src/components/AccountDeletionBanner.jsx")).toContain("Annuler la suppression");
  });

  it("canonical propre à la page, nom exact de l'application, aucune adresse inventée", () => {
    render(<DeleteAccountPage navigate={() => {}} />);
    expect(link.getAttribute("href")).toBe("https://baobab-app-zeta.vercel.app/suppression-compte");
    expect(document.title).toBe("Baobab — Supprimer mon compte Baobab");
    // Aucune adresse e-mail codée en dur : seule celle de src/config/contact.json peut apparaître.
    const withoutConfigured = SUPPORT_EMAIL ? document.body.textContent.split(SUPPORT_EMAIL).join("") : document.body.textContent;
    expect(withoutConfigured).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });

  it("le lien vers la politique de confidentialité navigue vers /confidentialite", () => {
    const navigate = vi.fn();
    render(<DeleteAccountPage navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "politique de confidentialité" }));
    expect(navigate).toHaveBeenCalledWith("/confidentialite");
  });
});
