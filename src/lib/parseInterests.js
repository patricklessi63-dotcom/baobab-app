// profiles.interests est stocké comme une chaîne texte séparée par
// virgules (pas un tableau réel) — voir App.jsx, matchingService.js et
// profileCompletion.js, qui réimplémentent chacun ce parsing
// indépendamment. Nouvel utilitaire partagé pour la Phase 6 uniquement
// (les 3 sites existants ne sont pas retouchés, hors périmètre).
import { normalizeForSearch } from "./searchQuery";

export function parseInterests(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Les intérêts viennent de INTERESTS_OPTIONS (constants.js) via ChipSelect, qui
// stocke l'option telle quelle, emoji compris : "🍳 Cuisine", "✈️ Voyage".
// Chercher cette chaîne brute dans un texte libre ne matche jamais (personne
// n'écrit "🍳 cuisine" dans une description) : le bonus "+2 par intérêt" et la
// raison "Lié à ..." des recommandations étaient donc morts. On retire le
// préfixe non alphanumérique (emoji, sélecteur de variation U+FE0F, espaces)
// puis on normalise (casse + accents) pour que "Cinéma" retrouve "cinema".
const NON_ALNUM_PREFIX_RE = /^[^\p{L}\p{N}]+/u;

export function interestSearchKey(interest) {
  return normalizeForSearch(String(interest || "").replace(NON_ALNUM_PREFIX_RE, "")).trim();
}

// Renvoie les intérêts (sous leur forme d'origine, emoji compris, pour
// l'affichage de la raison) dont le mot-clé apparaît dans `text`. Un intérêt
// sans lettre ni chiffre (clé vide) est ignoré : "".includes(...) est toujours
// vrai et matcherait n'importe quel texte.
export function matchInterests(interests, text) {
  const haystack = normalizeForSearch(text);
  return interests.filter((interest) => {
    const key = interestSearchKey(interest);
    return key !== "" && haystack.includes(key);
  });
}
