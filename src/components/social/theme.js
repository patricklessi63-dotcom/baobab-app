// Ré-export léger — les valeurs canoniques vivent désormais dans
// src/constants.js (source unique de vérité, chantier d'unification des
// palettes). Conservé comme fichier séparé pour que les ~56 consommateurs
// existants (SocialShell.jsx, tous les onglets, home/, premium/, ai/)
// n'aient aucune modification à faire.
import { C as BASE, primaryRgb as BASE_PRIMARY_RGB, navyRgb as BASE_NAVY_RGB } from "../../constants";

export const primary = BASE.primary;
export const navy = BASE.navy;
export const surface = BASE.surface;
export const green = BASE.green;
export const coral = BASE.coral;
export const gold = BASE.gold;
export const bg = BASE.bg;
export const muted = BASE.muted;
export const body = BASE.body;
export const online = BASE.online;
export const offline = BASE.offline;
export const goldTint = BASE.goldTint;
export const goldTintDeep = BASE.goldTintDeep;
export const goldText = BASE.goldText;
export const verified = BASE.verified;
export const surface2 = BASE.surface2;
export const gold1 = BASE.gold1;
export const gold2 = BASE.gold2;
export const textFaint = BASE.textFaint;
export const primaryRgb = BASE_PRIMARY_RGB;
export const navyRgb = BASE_NAVY_RGB;
// Classe Tailwind : la valeur arbitraire doit rester un littéral statique
// (le scanner de Tailwind lit le texte source, pas une variable interpolée)
// — donc "rgba(20,67,42,0.07)" reste écrit en dur ici volontairement.
export const card = "rounded-[28px] border border-[var(--bb-border)] bg-[var(--bb-surface)] shadow-[0_16px_50px_rgba(20,67,42,0.07)]";
export const buttonBase = "transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5";
