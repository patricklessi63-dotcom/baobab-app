import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug corrigé (audit rafraîchissement de session Supabase Auth) : quand
// GoTrueClient émet SIGNED_OUT de sa propre initiative pendant que l'app est
// activement utilisée — jeton de rafraîchissement révoqué à distance après un
// changement de mot de passe sur un autre appareil (signOut({scope:"others"})),
// ou renouvellement impossible après une coupure réseau prolongée (téléphone
// en mode avion plus d'une heure) — App.jsx retombait sur la vue "auth" sans
// que showAuthForm ne devienne vrai (le pathname reste "/" pendant toute
// l'utilisation de l'app, aucune route interne ne le change). Résultat :
// LandingPage (page vitrine marketing) s'affichait à la place du formulaire de
// connexion, sans aucune explication, et tout ce que la personne était en
// train de taper (message, formulaire d'événement...) disparaissait sans le
// moindre avertissement. Le correctif ajoute un drapeau sessionExpired
// (App.jsx) qui force l'affichage direct du formulaire de connexion avec un
// message clair. Ce test couvre la partie Auth.jsx : le bandeau doit
// apparaître en mode signin quand sessionExpired=true, et disparaître dès que
// l'utilisateur change d'écran (ex. "Mot de passe oublié ?").
vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import Auth from "./Auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Auth — bandeau session expirée", () => {
  it("affiche un message clair de reconnexion quand sessionExpired=true", () => {
    render(<Auth initialMode="signin" sessionExpired onDismissSessionExpired={() => {}} />);

    expect(screen.getByText("Ta session a expiré")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecte-toi pour continuer");
  });

  it("n'affiche rien quand sessionExpired=false (connexion normale)", () => {
    render(<Auth initialMode="signin" />);

    expect(screen.queryByText("Ta session a expiré")).not.toBeInTheDocument();
  });

  it("prévient le parent (onDismissSessionExpired) dès qu'on quitte l'écran de connexion", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Auth initialMode="signin" sessionExpired onDismissSessionExpired={onDismiss} />);

    expect(screen.getByText("Ta session a expiré")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mot de passe oublié ?" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Le bandeau est spécifique au mode signin (comme le bandeau "email
    // vérifié" existant) : il ne doit pas suivre l'utilisateur dans l'écran
    // de réinitialisation de mot de passe.
    expect(screen.queryByText("Ta session a expiré")).not.toBeInTheDocument();
  });
});
