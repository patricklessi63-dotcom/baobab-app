import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug corrigé (audit vérification d'âge minimum, onboarding) : l'inscription
// ne comportait AUCUNE case d'acceptation des Conditions d'utilisation / de
// la Politique de confidentialité — seulement deux boutons ouvrant ces
// textes en lecture, sans lien avec une condition bloquante. Ces tests
// couvrent le nouveau garde-fou (case obligatoire, bouton désactivé tant
// qu'elle n'est pas cochée, double vérification côté handleSubmit, et
// horodatage transmis à signUp()).
const signUp = vi.fn();
vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: (...args) => signUp(...args),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      resend: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock("./lib/geolocation", () => ({
  getCurrentPositionSafe: vi.fn(async () => ({ ok: true, latitude: 45.5, longitude: -73.6 })),
}));

import Auth from "./Auth";

const STRONG_PASSWORD = "Correct-Horse9";

beforeEach(() => {
  vi.clearAllMocks();
  signUp.mockResolvedValue({ data: { user: { identities: [{ id: "x" }] } }, error: null });
});

async function fillSignupForm(user) {
  await user.type(screen.getByLabelText("Adresse email"), "nouvel.utilisateur@example.com");
  await user.type(document.getElementById("password"), STRONG_PASSWORD);
  await user.type(document.getElementById("password-confirm"), STRONG_PASSWORD);
}

describe("Auth — acceptation obligatoire des CGU/Politique de confidentialité à l'inscription", () => {
  it("le bouton « Créer mon compte » reste désactivé tant que la case n'est pas cochée, même avec un mot de passe valide", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signup" />);

    await fillSignupForm(user);

    const submit = screen.getByRole("button", { name: "Créer mon compte" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
  });

  it("cocher puis décocher la case redésactive le bouton (pas de validation figée après un premier passage)", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signup" />);
    await fillSignupForm(user);

    const checkbox = screen.getByRole("checkbox");
    const submit = screen.getByRole("button", { name: "Créer mon compte" });
    await user.click(checkbox);
    expect(submit).toBeEnabled();
    await user.click(checkbox);
    expect(submit).toBeDisabled();
  });

  it("soumettre le formulaire directement (contournement du bouton désactivé) sans case cochée bloque quand même l'inscription et n'appelle pas signUp()", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signup" />);
    await fillSignupForm(user);

    // Contourne le `disabled` du bouton en déclenchant le submit du <form>
    // directement, pour vérifier le filet de sécurité dans handleSubmit
    // (même pattern que les autres doubles vérifications de ce fichier).
    const form = document.querySelector("form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/accepter les Conditions/);
    });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("une inscription valide avec case cochée transmet un horodatage d'acceptation à signUp()", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signup" />);
    await fillSignupForm(user);
    await user.click(screen.getByRole("checkbox"));

    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const [{ options }] = signUp.mock.calls[0];
    expect(options.data.terms_accepted_at).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(options.data.terms_accepted_at))).toBe(false);
  });

  it("changer de mode (inscription -> connexion -> inscription) réinitialise la case décochée", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signup" />);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();

    await user.click(screen.getByRole("button", { name: /Retour à la connexion/ }));
    await user.click(screen.getByRole("button", { name: "Inscris-toi" }));

    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
