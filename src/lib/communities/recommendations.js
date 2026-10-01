import { parseInterests } from "../parseInterests";
import { categoryLabel } from "./communityConfig";
import { normalizeForSearch } from "../searchQuery";

// Score déterministe — PAS de l'IA (item 52) : simple recoupement
// d'intérêts déclarés, de ville et de mots-clés, comme
// src/lib/matching/matchingService.js le fait déjà pour les profils.
// Utilisé pour trier un lot de communautés déjà chargé (jamais pour
// interroger toute la base — voir CommunitiesTab pour la requête bornée).
export function scoreCommunity(user, community) {
  let score = 0;
  const reasons = [];

  // Bug corrigé (même audit que matchingService.js/CommunitiesTab.jsx) :
  // "Ville" est un champ texte libre (EditProfileForm.jsx / formulaire de
  // création de communauté) — un simple .toLowerCase() est insensible à la
  // casse mais pas aux accents ("Montréal" vs "Montreal"), ce qui pouvait
  // faire manquer silencieusement la raison "À <ville>, comme toi" et les
  // points associés pour deux personnes pourtant dans la même ville.
  if (user?.city && community.city && normalizeForSearch(user.city.trim()) === normalizeForSearch(community.city.trim())) {
    score += 3;
    reasons.push(`À ${community.city}, comme toi`);
  }

  const interests = parseInterests(user?.interests);
  if (interests.length > 0) {
    const haystack = `${categoryLabel(community.category)} ${community.name} ${community.description || ""}`.toLowerCase();
    const matched = interests.filter((interest) => haystack.includes(interest.toLowerCase()));
    if (matched.length > 0) {
      score += matched.length * 2;
      reasons.push(`Lié à ${matched.slice(0, 2).join(", ")}`);
    }
  }

  return { score, reasons };
}

export function rankCommunities(user, communities) {
  return communities
    .map((c) => ({ community: c, ...scoreCommunity(user, c) }))
    .sort((a, b) => b.score - a.score);
}
