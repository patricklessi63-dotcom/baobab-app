// ============================================================================
// Calcul de complétion du profil — pondération configurable, somme = 100%.
// Le projet de vie et la personnalité ne comptent volontairement pour rien :
// le spec les marque explicitement comme facultatifs, les inclure créerait
// une pression implicite à les remplir.
// ============================================================================

function hasIntimateIntent(lookingFor) {
  return /Amour|Relation sérieuse/i.test(lookingFor || "");
}

function parseList(text) {
  return (text || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function getProfileCompletion(profile, photos = []) {
  if (!profile) return { percent: 0, tips: [] };

  const tips = [];
  let percent = 0;

  // Photo — 20%
  const photoCount = photos.length;
  if (photoCount >= 1) percent += 10;
  else tips.push("Ajoute une photo pour améliorer ton profil.");
  if (photoCount >= 3) percent += 10;
  else if (photoCount >= 1) tips.push("Ajoute encore quelques photos (jusqu'à 3) pour un profil plus engageant.");

  // Identité — 10%
  if (profile.name?.trim()) percent += 5;
  if (profile.birth_date) percent += 5;
  else tips.push("Ajoute ta date de naissance.");

  // Localisation — 10%
  if (profile.country?.trim()) percent += 4;
  if (profile.province?.trim()) percent += 3;
  if (profile.city?.trim()) percent += 3;
  else tips.push("Ajoute ta ville pour apparaître dans les recommandations proches de toi.");

  // Intentions — 15%
  const lookingForFilled = Boolean(profile.looking_for?.trim());
  if (lookingForFilled) percent += 10;
  else tips.push("Indique ce que tu recherches sur Baobab.");
  const intentionApplicable = hasIntimateIntent(profile.looking_for);
  if (lookingForFilled && (!intentionApplicable || profile.relationship_values?.trim())) percent += 5;

  // Centres d'intérêt — 15%
  const interestCount = parseList(profile.interests).length;
  if (interestCount >= 5) percent += 15;
  else if (interestCount >= 1) {
    percent += 7;
    tips.push("Ajoute quelques centres d'intérêt en plus (5 ou plus) pour de meilleures recommandations.");
  } else {
    tips.push("Ajoute tes centres d'intérêt pour recevoir de meilleures recommandations.");
  }

  // Bio — 10%
  const bioLen = (profile.bio || "").trim().length;
  if (bioLen > 0) percent += 5;
  else tips.push("Parle un peu de toi dans ta bio.");
  if (bioLen >= 80) percent += 5;

  // Parcours Canada — 10% (2.5% x 4)
  if (profile.arrived_since?.trim()) percent += 2.5;
  if (profile.immigration_status?.trim()) percent += 2.5;
  if (profile.occupation?.trim()) percent += 2.5;
  if (profile.education_level?.trim()) percent += 2.5;
  if (!profile.arrived_since?.trim() || !profile.immigration_status?.trim()) {
    tips.push("Complète ton parcours au Canada pour aider les autres à mieux te connaître.");
  }

  // Langues — 10%
  const langCount = Array.isArray(profile.languages_detail) ? profile.languages_detail.length : 0;
  if (langCount >= 1) percent += 5;
  if (langCount >= 2) percent += 5;
  else if (langCount === 0) tips.push("Ajoute les langues que tu parles.");

  return {
    percent: Math.round(Math.min(100, percent)),
    tips,
  };
}
