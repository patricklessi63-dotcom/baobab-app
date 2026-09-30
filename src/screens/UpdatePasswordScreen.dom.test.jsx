import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug corrigé (audit sécurité du flux "mot de passe oublié") : après un
// changement de mot de passe réussi via le lien de récupération, les AUTRES
// sessions actives (autre appareil, session oubliée sur un appareil
// partagé...) restaient valides indéfiniment — Supabase Auth ne les révoque
// pas automatiquement. Ces tests couvrent l'appel signOut({ scope: "others" })
// ajouté juste après updateUser(), sans déconnecter la session courante ni
// bloquer le succès déjà acquis si cet appel best-effort échoue.
const updateUser = vi.fn();
const signOut = vi.fn();
vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      updateUser: (...args) => updateUser(...args),
      signOut: (...args) => signOut(...args),
    },
  },
}));

import UpdatePasswordScreen from "./UpdatePasswordScreen";

const STRONG_PASSWORD = "Correct-Horse9";

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ error: null });
  signOut.mockResolvedValue({ error: null });
});

async function fillAndSubmit(user) {
  await user.type(document.getElementById("new-password"), STRONG_PASSWORD);
  await user.type(document.getElementById("confirm-password"), STRONG_PASSWORD);
  await user.click(screen.getByRole("button", { name: "Mettre à jour le mot de passe" }));
}

describe("UpdatePasswordScreen — révocation des autres sessions après changement de mot de passe", () => {
  it("appelle signOut({ scope: \"others\" }) après un updateUser() réussi", async () => {
    const user = userEvent.setup();
    render(<UpdatePasswordScreen />);
    await fillAndSubmit(user);

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: STRONG_PASSWORD }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "others" }));
    // La session courante n'est pas fermée : le message de succès s'affiche.
    expect(await screen.findByText(/Mot de passe mis à jour/)).toBeInTheDocument();
  });

  it("n'appelle jamais signOut si updateUser() échoue", async () => {
    updateUser.mockResolvedValue({ error: { message: "Auth session missing!" } });
    const user = userEvent.setup();
    render(<UpdatePasswordScreen />);
    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(signOut).not.toHaveBeenCalled();
  });

  it("un échec de signOut (réseau) n'empêche pas d'afficher le succès du changement de mot de passe", async () => {
    signOut.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(<UpdatePasswordScreen />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/Mot de passe mis à jour/)).toBeInTheDocument();
  });
});

// Régression corrigée (audit post-aea682d, "Ta session a expiré") : le bouton
// "Retour à la connexion" (affiché quand updateUser() échoue, ex. lien de
// récupération expiré/déjà utilisé) déconnecte la session de récupération en
// cours via supabase.auth.signOut(). App.jsx affiche un bandeau "Ta session a
// expiré" pour tout SIGNED_OUT reçu alors qu'une session active existait, SAUF
// si App.jsx a positionné son manualSignOutRef juste avant l'appel — ce que le
// prop onSignOut (fourni par App.jsx via signOutWithoutExpiredBanner) permet.
// Sans passer par ce prop, ce clic volontaire affichait à tort ce bandeau.
describe("UpdatePasswordScreen — bouton \"Retour à la connexion\" (lien expiré/déjà utilisé)", () => {
  it("appelle le prop onSignOut fourni par App.jsx plutôt que supabase.auth.signOut() directement", async () => {
    updateUser.mockResolvedValue({ error: { message: "Auth session missing!" } });
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UpdatePasswordScreen onSignOut={onSignOut} />);
    await fillAndSubmit(user);

    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retour à la connexion" }));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
    // Le wrapper d'App.jsx (signOutWithoutExpiredBanner) gère lui-même l'appel
    // à supabase.auth.signOut() en interne : ce composant ne doit pas
    // l'appeler une deuxième fois en plus du prop.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("se rabat sur supabase.auth.signOut() si aucun prop onSignOut n'est fourni", async () => {
    updateUser.mockResolvedValue({ error: { message: "Auth session missing!" } });
    const user = userEvent.setup();
    render(<UpdatePasswordScreen />);
    await fillAndSubmit(user);

    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retour à la connexion" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});
