// Durée d'affichage d'un statut avant l'avance automatique.
//
// Bug corrigé : tous les statuts duraient 5 s, quel que soit leur contenu, et le minuteur ne se
// mettait en pause que pendant la frappe d'une réponse. Pour lire un texte puis choisir une
// réaction, il ne restait que quelques secondes : la visionneuse se refermait avant qu'on ait pu
// réagir (« impossible de réagir aux statuts »). Un statut texte dure maintenant plus longtemps
// selon sa longueur ; une vidéo garde sa durée réelle (appliquée par StoryViewerModal).
export const STORY_MIN_MS = 5000;
export const STORY_MAX_MS = 15000;
const MS_PER_CHAR = 70;

export function storyDurationFor(story) {
  if (!story) return STORY_MIN_MS;
  if (story.media_url) return STORY_MIN_MS; // photo/vidéo : la durée vidéo est fixée à part
  const length = String(story.text || "").trim().length;
  return Math.min(STORY_MAX_MS, Math.max(STORY_MIN_MS, 4000 + length * MS_PER_CHAR));
}
