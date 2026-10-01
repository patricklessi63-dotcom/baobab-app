import { parseInterests } from "../parseInterests";
import { categoryLabel } from "./eventConfig";
import { normalizeForSearch } from "../searchQuery";

// Score déterministe — PAS de l'IA (même discipline que
// communities/recommendations.js) : ville partagée, mots-clés d'intérêts,
// communauté commune. Utilisé pour trier un lot d'événements déjà chargé.
export function scoreEvent(user, event, myCommunityIds = []) {
  let score = 0;
  const reasons = [];

  // Bug corrigé (même audit que matchingService.js/EventsTab.jsx) : "Ville"
  // est un champ texte libre, insensible aux accents avec un simple
  // .toLowerCase() ("Montréal" vs "Montreal") — voir
  // communities/recommendations.js pour le même correctif.
  if (user?.city && event.city && normalizeForSearch(user.city.trim()) === normalizeForSearch(event.city.trim())) {
    score += 3;
    reasons.push(`À ${event.city}, comme toi`);
  }

  const interests = parseInterests(user?.interests);
  if (interests.length > 0) {
    const haystack = `${categoryLabel(event.category)} ${event.title} ${event.description || ""}`.toLowerCase();
    const matched = interests.filter((interest) => haystack.includes(interest.toLowerCase()));
    if (matched.length > 0) {
      score += matched.length * 2;
      reasons.push(`Lié à ${matched.slice(0, 2).join(", ")}`);
    }
  }

  if (event.community_id && myCommunityIds.includes(event.community_id)) {
    score += 2;
    reasons.push("Organisé par une de tes communautés");
  }

  return { score, reasons };
}

export function rankEvents(user, events, myCommunityIds = []) {
  return events
    .map((e) => ({ event: e, ...scoreEvent(user, e, myCommunityIds) }))
    .sort((a, b) => b.score - a.score);
}
