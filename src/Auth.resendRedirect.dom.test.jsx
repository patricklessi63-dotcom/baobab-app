import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug corrigé (audit confirmation email) : "Renvoyer le code/l'email" appelait
// supabase.auth.resend({ type: "signup", email }) SANS `options.emailRedirectTo`.
// supabase-js envoie alors `redirectTo: undefined` au endpoint /resend (voir
// node_modules/@supabase/auth-js GoTrueClient.js#resend), et le serveur
// retombe sur le Site URL par défaut du projet Supabase — SANS le marqueur
// "?verified=1" que signUp() ajoute pourtant explicitement. Conséquence
// concrète : un lien de confirmation RENVOYÉ ne fait plus détecter
// pendingVerifiedRef côté App.jsx, donc onAuthStateChange traite le SIGNED_IN
// qui suit comme une connexion normale et laisse l'utilisateur connecté
// directement — contournant la règle voulue "ne jamais auto-connecter depuis
// un lien de confirmation email" (appliquée pour le lien original). Le lien
// renvoyé et le lien original doivent rediriger vers la même URL.
const resend = vi.fn(async () => ({ error: null }));
vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(async () => ({ error: { code: "email_not_confirmed", message: "Email not confirmed" } })),
      resetPasswordForEmail: vi.fn(),
      resend: (...args) => resend(...args),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import Auth from "./Auth";

beforeEach(() => {
  vi.clearAllMocks();
  resend.mockResolvedValue({ error: null });
});

describe("Auth — renvoi de l'email/lien de confirmation", () => {
  it("le renvoi depuis l'écran « email non vérifié » transmet le même emailRedirectTo que l'inscription initiale", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signin" />);

    await user.type(screen.getByLabelText("Adresse email"), "existant@example.com");
    await user.type(document.getElementById("password"), "peu-importe");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    // signInWithPassword échoue avec "email_not_confirmed" -> bascule sur l'écran
    // unverified (le titre "Email non vérifié" est rendu mot par mot dans des
    // <span> séparés, donc on attend plutôt le bouton de renvoi, seul indicateur
    // fiable en un seul nœud de texte que le mode a bien basculé).
    const resendButton = await screen.findByRole("button", { name: /Renvoyer l'email/ });
    await user.click(resendButton);

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    const [args] = resend.mock.calls[0];
    expect(args.type).toBe("signup");
    expect(args.options?.emailRedirectTo).toBe(`${window.location.origin}/?verified=1`);
  });
});
