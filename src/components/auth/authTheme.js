// Ré-export léger — les valeurs canoniques vivent désormais dans
// src/constants.js (source unique de vérité, chantier d'unification des
// palettes). Conservé comme fichier séparé pour que les consommateurs
// existants (Auth.jsx, UpdatePasswordScreen.jsx, PasswordField.jsx,
// PasswordStrengthMeter.jsx, LandingPage.jsx, PublicPageShell.jsx)
// n'aient aucune modification à faire.
import { C as BASE } from "../../constants";

export const C = {
  dusk: BASE.dusk,
  dusk3: BASE.dusk3,
  bark: BASE.bark,
  clay: BASE.clay,
  ochre: BASE.ochre,
  acacia: BASE.acacia,
  sand: BASE.sand,
  sandDim: BASE.sandDim,
};
