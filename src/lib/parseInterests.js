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

// Un intérêt composé ("Yoga & méditation") est cherché mot-clé par mot-clé :
// la phrase entière n'apparaît presque jamais telle quelle dans un texte libre.
const COMPOUND_SPLIT_RE = /\s*[&/]\s*/;
// En dessous de cette longueur, la clé doit être un mot entier ("art" ne doit
// pas matcher "départ", "mode" ne doit pas matcher "modération").
const SHORT_KEY_MAX = 4;
const WORD_CHAR = "\\p{L}\\p{N}";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pas de lookbehind (?<!...) : non supporté avant Safari/iOS 16.4, et l'app
// tourne aussi dans une WebView Capacitor — on capture le caractère précédent.
function keywordRegExp(key) {
  const tail = key.length <= SHORT_KEY_MAX ? `[sx]?(?![${WORD_CHAR}])` : "";
  return new RegExp(`(?:^|[^${WORD_CHAR}])${escapeRegExp(key)}${tail}`, "u");
}

// Renvoie les intérêts (sous leur forme d'origine, emoji compris, pour
// l'affichage de la raison) dont un mot-clé apparaît dans `text`. Le mot-clé
// doit commencer un mot ("sport" retrouve "sportif", pas "transport") ; les
// clés courtes doivent être un mot entier, pluriel simple accepté. Un intérêt
// sans lettre ni chiffre (clé vide) est ignoré : "".includes(...) est toujours
// vrai et matcherait n'importe quel texte.
export function matchInterests(interests, text) {
  const haystack = normalizeForSearch(text);
  return interests.filter((interest) =>
    interestSearchKey(interest)
      .split(COMPOUND_SPLIT_RE)
      .map((k) => k.trim())
      .filter(Boolean)
      .some((k) => keywordRegExp(k).test(haystack))
  );
}
