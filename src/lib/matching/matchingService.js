// ============================================================================
// Baobab Match — service de compatibilité (v2, à base de règles déterministes
// et explicables — PAS d'IA). Remplace src/lib/compatibility.js.
//
// Chaque score est calculé uniquement à partir de champs de profil réellement
// enregistrés dans Supabase. Aucune caractéristique sensible ou protégée
// (origine, religion, orientation sexuelle, handicap, santé, politique)
// n'entre jamais dans le calcul — voir matchingConfig.NEVER_USED_FOR_SCORING.
// ============================================================================

import { MATCH_WEIGHTS, SCORE_FLOOR, SCORE_CEIL, DISCLAIMER, ROMANTIC_INTENTION_MARKERS } from "./matchingConfig.js";

function parseList(text) {
  return (text || "")
    .split(/[,;/]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalized(list) {
  return list.map((t) => t.toLowerCase());
}

function sharedOf(listA, listB) {
  const setB = new Set(normalized(listB));
  const seen = new Set();
  return listA.filter((t) => {
    const key = t.toLowerCase();
    if (!setB.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasRomanticIntent(lookingForList) {
  return lookingForList.some((v) => ROMANTIC_INTENTION_MARKERS.some((m) => v.includes(m)));
}

function languageNames(profile) {
  if (Array.isArray(profile.languages_detail) && profile.languages_detail.length > 0) {
    return profile.languages_detail.map((l) => l.language).filter(Boolean);
  }
  return parseList(profile.languages);
}

function scoreIntentions(userA, userB) {
  const listA = parseList(userA.looking_for);
  const listB = parseList(userB.looking_for);
  const shared = sharedOf(listA, listB);
  let points = Math.min(shared.length * 8, 24);

  const bothRomantic = hasRomanticIntent(listA) && hasRomanticIntent(listB);
  const sharedValues = bothRomantic ? sharedOf(parseList(userA.relationship_values), parseList(userB.relationship_values)) : [];
  if (bothRomantic && sharedValues.length > 0) points += 6;

  return {
    points: Math.min(points, MATCH_WEIGHTS.intentions),
    shared,
    compatibleIntentions: shared.length > 0,
  };
}

function scoreInterests(userA, userB) {
  // userB.show_interests régit la visibilité des intérêts de userB pour
  // n'importe quel autre viewer (voir DiscoverTab.jsx/PublicProfileModal.jsx)
  // — sans ce garde, "commonInterests" affichait ici nommément des intérêts
  // que la personne avait explicitement masqués (carte de compatibilité,
  // MatchCard, ConversationStarters...).
  const interestsB = userB.show_interests === false ? "" : userB.interests;
  const shared = sharedOf(parseList(userA.interests), parseList(interestsB));
  return { points: Math.min(shared.length * 5, MATCH_WEIGHTS.interests), shared };
}

function scoreLifeProject(userA, userB) {
  let points = 0;
  const fields = [
    ["wants_children", 5],
    ["family_importance", 4],
    ["career_goal", 3],
    ["geographic_openness", 3],
  ];
  for (const [field, weight] of fields) {
    const a = (userA[field] || "").trim();
    const b = (userB[field] || "").trim();
    if (a && b && a === b) points += weight;
  }
  return { points: Math.min(points, MATCH_WEIGHTS.lifeProject) };
}

function scorePreferences(userA, userB) {
  let points = 0;
  const hasCustomAgePref = (userA.pref_age_min ?? 18) > 18 || (userA.pref_age_max ?? 99) < 99;

  if (typeof userA.age === "number" && typeof userB.age === "number") {
    const gap = Math.abs(userA.age - userB.age);
    if (gap <= 2) points += 8;
    else if (gap <= 5) points += 6;
    else if (gap <= 10) points += 3;
  }

  const distancePref = userA.pref_distance || "";
  const sameCity = Boolean(userA.city && userB.city && userA.city.trim().toLowerCase() === userB.city.trim().toLowerCase());
  const sameCountry = Boolean(userA.country && userB.country && userA.country.trim().toLowerCase() === userB.country.trim().toLowerCase());
  if (distancePref === "Ma ville uniquement" && sameCity) points += 7;
  else if (distancePref === "Ma ville ou mon pays" && (sameCity || sameCountry)) points += 7;
  else if (distancePref === "Peu importe") points += 7;

  return { points: Math.min(points, MATCH_WEIGHTS.preferences), hasCustomAgePref };
}

function scoreLanguages(userA, userB) {
  const shared = sharedOf(languageNames(userA), languageNames(userB));
  return { points: Math.min(shared.length * 5, MATCH_WEIGHTS.languages), shared };
}

function scoreLocation(userA, userB) {
  const cityA = (userA.city || "").trim().toLowerCase();
  const cityB = (userB.city || "").trim().toLowerCase();
  const countryA = (userA.country || "").trim().toLowerCase();
  const countryB = (userB.country || "").trim().toLowerCase();

  if (cityA && cityB && cityA === cityB) {
    return { points: MATCH_WEIGHTS.location, level: "same_city", label: `Même ville (${userB.city})` };
  }
  if (countryA && countryB && countryA === countryB) {
    return { points: Math.round(MATCH_WEIGHTS.location / 2), level: "same_country", label: `Même pays d'origine (${userB.country})` };
  }
  return { points: 0, level: "unknown", label: null };
}

export function computeMatch(currentUser, candidate) {
  if (!currentUser || !candidate) {
    return {
      score: 0, level: "unknown", reasons: [], commonInterests: [], compatibleIntentions: false,
      sharedIntentions: [], locationLabel: null,
      breakdown: {}, disclaimer: DISCLAIMER, source: "rules-v2",
    };
  }

  const intentions = scoreIntentions(currentUser, candidate);
  const interests = scoreInterests(currentUser, candidate);
  const lifeProject = scoreLifeProject(currentUser, candidate);
  const preferences = scorePreferences(currentUser, candidate);
  const languages = scoreLanguages(currentUser, candidate);
  const location = scoreLocation(currentUser, candidate);

  const breakdown = {
    intentions: intentions.points,
    interests: interests.points,
    lifeProject: lifeProject.points,
    preferences: preferences.points,
    languages: languages.points,
    location: location.points,
  };

  const rawScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const score = Math.max(SCORE_FLOOR, Math.min(SCORE_CEIL, Math.round(rawScore)));

  // Raisons : une phrase par catégorie qui a rapporté des points, dans
  // l'ordre des pondérations, jamais inventées, jamais plus de 4.
  const candidateReasons = [];
  if (intentions.shared.length > 0) {
    candidateReasons.push(`Vous recherchez tous les deux : ${intentions.shared.join(", ")}`);
  }
  if (interests.shared.length > 0) {
    candidateReasons.push(`${interests.shared.length} centre${interests.shared.length > 1 ? "s" : ""} d'intérêt en commun`);
  }
  if (lifeProject.points > 0) {
    candidateReasons.push("Vous avez une vision similaire de votre projet de vie");
  }
  if (preferences.hasCustomAgePref && preferences.points >= 8) {
    candidateReasons.push("Son âge correspond à tes préférences");
  }
  if (languages.shared.length > 0) {
    candidateReasons.push(`Langue${languages.shared.length > 1 ? "s" : ""} en commun : ${languages.shared.join(", ")}`);
  }
  if (location.label) {
    candidateReasons.push(location.label);
  }

  const reasons = candidateReasons.length > 0
    ? candidateReasons.slice(0, 4)
    : ["Peu d'informations en commun pour l'instant — complétez vos profils pour affiner l'estimation."];

  return {
    score,
    level: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
    reasons,
    commonInterests: interests.shared,
    compatibleIntentions: intentions.compatibleIntentions,
    sharedIntentions: intentions.shared,
    locationLabel: location.label,
    breakdown,
    disclaimer: DISCLAIMER,
    source: "rules-v2",
  };
}

// Filtre dur : exclut les candidats hors des préférences explicites de
// l'utilisateur (âge, distance). N'exclut jamais quelqu'un pour une donnée
// manquante — seulement pour une donnée présente et hors plage.
export function filterCandidatesByPreferences(currentUser, candidates) {
  if (!currentUser) return candidates;
  const minAge = currentUser.pref_age_min ?? 18;
  const maxAge = currentUser.pref_age_max ?? 99;
  const distance = currentUser.pref_distance || "";
  // Filtre dur "type de relation recherché" (item audit) — jusqu'ici
  // looking_for n'était utilisé que comme signal de score (scoreLookingFor
  // plus bas), jamais pour exclure explicitement un profil.
  const wantedTypes = parseList(currentUser.pref_looking_for);

  return candidates.filter((c) => {
    if (typeof c.age === "number" && (c.age < minAge || c.age > maxAge)) return false;

    if (distance === "Ma ville uniquement") {
      const sameCity = currentUser.city && c.city && c.city.trim().toLowerCase() === currentUser.city.trim().toLowerCase();
      if (!sameCity) return false;
    } else if (distance === "Ma ville ou mon pays") {
      const sameCity = currentUser.city && c.city && c.city.trim().toLowerCase() === currentUser.city.trim().toLowerCase();
      const sameCountry = currentUser.country && c.country && c.country.trim().toLowerCase() === currentUser.country.trim().toLowerCase();
      if (!sameCity && !sameCountry) return false;
    }

    if (wantedTypes.length > 0) {
      const candidateTypes = parseList(c.looking_for);
      // Ne filtre que si le candidat a renseigné looking_for (voir invariant
      // ci-dessus) — sinon un profil incomplet (onboarding terminé plus tôt,
      // étape 5/10, looking_for jamais rempli) devenait invisible pour
      // toujours dès qu'un viewer avait une préférence de type de relation.
      if (candidateTypes.length > 0 && !candidateTypes.some((t) => wantedTypes.includes(t))) return false;
    }
    return true;
  });
}

// Filtre + classe. Utilisé par toutes les surfaces de recommandation pour
// éviter de dupliquer la logique de calcul/tri.
export function rankCandidates(currentUser, candidates) {
  if (!currentUser) return [];
  const filtered = filterCandidatesByPreferences(currentUser, candidates).filter((c) => c.id !== currentUser.id);
  return filtered
    .map((profile) => ({ profile, match: computeMatch(currentUser, profile) }))
    .sort((a, b) => b.match.score - a.match.score);
}
