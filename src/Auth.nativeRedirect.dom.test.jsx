import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Dans l'app native, window.location.origin vaut https://localhost (WebView) :
// adresse absente des « Redirect URLs » de Supabase, donc le lien reçu par e-mail
// n'ouvrirait pas la bonne page. En natif, redirectTo / emailRedirectTo doivent
// utiliser le domaine PUBLIC (lib/publicOrigin.js) ; sur le web, window.location.origin
// (comportement inchangé, couvert aussi par Auth.resendRedirect.dom.test.jsx).

const plat = vi.hoisted(() => ({ native: true }));
vi.mock("./lib/platform", () => ({ isNative: () => plat.native, getPlatform: () => (plat.native ? "android" : "web") }));

const auth = vi.hoisted(() => ({
  resend: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({ error: { code: "email_not_confirmed", message: "Email not confirmed" } })),
}));
vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: (...a) => auth.signInWithPassword(...a),
      resetPasswordForEmail: (...a) => auth.resetPasswordForEmail(...a),
      resend: (...a) => auth.resend(...a),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import Auth from "./Auth";
import { PUBLIC_WEB_ORIGIN } from "./lib/publicOrigin";

beforeEach(() => {
  vi.clearAllMocks();
  plat.native = true;
});

async function requestReset(user) {
  await user.click(screen.getByRole("button", { name: "Mot de passe oublié ?" }));
  await user.type(screen.getByLabelText("Adresse email"), "moi@example.com");
  await user.click(screen.getByRole("button", { name: "Envoyer le lien" }));
}

describe("Auth — URL de redirection des e-mails", () => {
  it("natif : réinitialisation de mot de passe -> domaine public, jamais https://localhost", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signin" />);
    await requestReset(user);
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1));
    const [, options] = auth.resetPasswordForEmail.mock.calls[0];
    expect(options.redirectTo).toBe(`${PUBLIC_WEB_ORIGIN}/update-password`);
    expect(options.redirectTo).not.toContain("localhost");
  });

  it("web : réinitialisation de mot de passe -> window.location.origin, inchangé", async () => {
    plat.native = false;
    const user = userEvent.setup();
    render(<Auth initialMode="signin" />);
    await requestReset(user);
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1));
    expect(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe(`${window.location.origin}/update-password`);
  });

  it("natif : renvoi du lien de confirmation -> domaine public + ?verified=1", async () => {
    const user = userEvent.setup();
    render(<Auth initialMode="signin" />);
    await user.type(screen.getByLabelText("Adresse email"), "existant@example.com");
    await user.type(document.getElementById("password"), "peu-importe");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    await user.click(await screen.findByRole("button", { name: /Renvoyer l'email/ }));
    await waitFor(() => expect(auth.resend).toHaveBeenCalledTimes(1));
    expect(auth.resend.mock.calls[0][0].options.emailRedirectTo).toBe(`${PUBLIC_WEB_ORIGIN}/?verified=1`);
  });
});
