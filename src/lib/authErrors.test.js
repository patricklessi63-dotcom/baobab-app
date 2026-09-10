import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { traduireAuthErreur } from "./authErrors.js";

// Le module lit navigator.onLine (absent en environnement Node -> undefined,
// donc !navigator.onLine serait vrai). On force un navigator "en ligne" pour
// que le filet de sécurité générique soit atteignable dans les tests.
beforeEach(() => {
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("traduireAuthErreur — mapping code -> message FR", () => {
  const cases = [
    ["invalid_credentials", "Invalid login credentials", "Email ou mot de passe incorrect."],
    ["user_already_exists", "User already registered", "Cette adresse email est déjà associée à un compte Baobab."],
    ["same_password", "New password should be different from the old password", "Ton nouveau mot de passe doit être différent de l'ancien."],
    ["weak_password", "Password should be at least 6 characters", "Le mot de passe ne respecte pas les règles minimales."],
    ["validation_failed", "Unable to validate email address: invalid format", "Entre une adresse email valide."],
    ["over_email_send_rate_limit", "email rate limit exceeded", "Trop de tentatives. Réessaie dans quelques minutes."],
    ["session_not_found", "Auth session missing!", "Ta session de réinitialisation a expiré ou ce lien a déjà été utilisé. Demande un nouveau lien de réinitialisation."],
    ["otp_expired", "Token has expired or is invalid", "Code invalide ou expiré. Vérifie les chiffres saisis ou demande un nouveau code."],
  ];

  it.each(cases)("code %s -> message dédié", (code, message, expected) => {
    expect(traduireAuthErreur({ code, message })).toBe(expected);
    // Le mapping fonctionne aussi via le texte du message seul (sans code).
    expect(traduireAuthErreur({ message })).toBe(expected);
  });

  it("laisse passer le message du hook liste blanche beta tel quel", () => {
    const msg = "Inscription en beta privée sur invitation uniquement.";
    expect(traduireAuthErreur({ message: msg })).toBe(msg);
  });

  it("gère l'adresse déjà confirmée", () => {
    expect(traduireAuthErreur({ message: "Email link is invalid or already confirmed" })).toBe(
      "Cette adresse est déjà vérifiée. Tu peux te connecter directement.",
    );
  });

  it("filet de sécurité : un code inconnu ne fait JAMAIS fuiter le message technique brut", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const brut = "TypeError: supabaseClient._request is not a function at line 42";
    const out = traduireAuthErreur({ code: "some_unknown_code", message: brut });
    expect(out).toBe("Une erreur est survenue. Réessaie dans un instant.");
    expect(out).not.toContain(brut);
    expect(spy).toHaveBeenCalled(); // enregistré pour diagnostic uniquement
  });

  it("gère une erreur nulle / vide sans jeter", () => {
    expect(traduireAuthErreur(null)).toBe("Une erreur est survenue. Réessaie dans un instant.");
    expect(traduireAuthErreur({})).toBe("Une erreur est survenue. Réessaie dans un instant.");
  });

  it("signale l'absence de connexion quand navigator.onLine est faux", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(traduireAuthErreur({ code: "some_unknown_code", message: "peu importe" })).toBe("Pas de connexion internet.");
  });
});
