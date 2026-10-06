import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Ergonomie de saisie de l'authentification (mobile) : sans les bons
// attributs autocomplete / inputMode / autoCapitalize, les gestionnaires de
// mots de passe ne proposent ni remplissage ni mot de passe fort, et le
// clavier mobile capitalise ou « corrige » l'adresse email et le mot de passe
// affiché.
vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      resend: vi.fn(),
      verifyOtp: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));
vi.mock("./lib/geolocation", () => ({
  getCurrentPositionSafe: vi.fn(async () => ({ ok: true, latitude: 45.5, longitude: -73.6 })),
}));

import Auth from "./Auth";

beforeEach(() => vi.clearAllMocks());

function expectNoMobileTextAssist(input) {
  expect(input).toHaveAttribute("autocapitalize", "none");
  expect(input).toHaveAttribute("autocorrect", "off");
  expect(input).toHaveAttribute("spellcheck", "false");
}

describe("Auth — attributs de saisie", () => {
  it("connexion : email (email/inputmode/pas d'autocorrection) + mot de passe current-password", () => {
    render(<Auth initialMode="signin" />);
    const email = screen.getByLabelText("Adresse email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("inputmode", "email");
    expectNoMobileTextAssist(email);

    const pw = screen.getByLabelText("Mot de passe");
    expect(pw).toHaveAttribute("type", "password");
    expect(pw).toHaveAttribute("autocomplete", "current-password");
    expect(pw).toHaveAttribute("name", "password");
    expectNoMobileTextAssist(pw);
  });

  it("inscription : les deux champs mot de passe sont en new-password", () => {
    render(<Auth initialMode="signup" />);
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirmer le mot de passe")).toHaveAttribute("autocomplete", "new-password");
  });

  it("réinitialisation : champ email seul avec les mêmes attributs", () => {
    render(<Auth initialMode="reset" />);
    const email = screen.getByLabelText("Adresse email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expectNoMobileTextAssist(email);
  });

  it("le formulaire est un vrai <form> avec un bouton de soumission type=submit", () => {
    render(<Auth initialMode="signin" />);
    const submit = screen.getByRole("button", { name: "Se connecter" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit.closest("form")).not.toBeNull();
  });

  it("bouton afficher/masquer : libellé fixe, aria-pressed bascule, type bascule, valeur conservée", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signin" />);
    const pw = screen.getByLabelText("Mot de passe");
    await user.type(pw, "Secret-123");
    const toggle = screen.getByRole("button", { name: "Afficher le mot de passe" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(pw).toHaveAttribute("type", "text");
    expect(pw).toHaveValue("Secret-123");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    // Les attributs anti-clavier-prédictif restent en mode texte.
    expectNoMobileTextAssist(pw);

    await user.click(toggle);
    expect(pw).toHaveAttribute("type", "password");
    expect(pw).toHaveValue("Secret-123");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("le bouton afficher/masquer ne vole pas le focus du champ au clic souris/toucher", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signin" />);
    const pw = screen.getByLabelText("Mot de passe");
    await user.click(pw);
    await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(pw).toHaveFocus();
  });

  it("email invalide côté JS (a@b) : erreur annoncée, focus ramené sur le champ email, champ relié à l'erreur", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signin" />);
    const email = screen.getByLabelText("Adresse email");
    await user.type(email, "a@b");
    await user.type(screen.getByLabelText("Mot de passe"), "x");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("adresse email valide");
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute("aria-describedby", alert.id);
  });

  it("inscription : mot de passe rattaché à la jauge, confirmation en aria-invalid si différente", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signup" />);
    const pw = screen.getByLabelText("Mot de passe");
    await user.type(pw, "Correct-Horse9");
    expect(pw.getAttribute("aria-describedby")).toContain("password-strength");
    const confirm = screen.getByLabelText("Confirmer le mot de passe");
    await user.type(confirm, "Autre");
    expect(confirm).toHaveAttribute("aria-invalid", "true");
    expect(confirm.getAttribute("aria-describedby")).toBe("password-confirm-hint");
    expect(document.getElementById("password-confirm-hint")).toHaveTextContent("ne correspondent pas");
  });

  it("la checklist de la jauge dit aux lecteurs d'écran quelles règles sont respectées", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signup" />);
    await user.type(screen.getByLabelText("Mot de passe"), "abc");
    expect(screen.getByText(/1 lettre minuscule/).closest("li")).toHaveTextContent("respecté");
    expect(screen.getByText(/8 caractères minimum/).closest("li")).toHaveTextContent("manquant");
  });
});
