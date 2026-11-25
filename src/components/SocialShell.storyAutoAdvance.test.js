import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Avance automatique des statuts : le minuteur doit appeler la DERNIÈRE version de nextStory() (référence), pas celle du
// rendu où il a été posé. Sinon il lit l'ancienne liste visibleStories : un statut arrivé en temps réel (ou masqué)
// pendant l'affichage faisait sauter un statut ou fermer la visionneuse trop tôt. Garde-fou de source (le minuteur
// dépend de l'horloge et du temps réel, difficiles à reproduire dans un rendu complet de SocialShell).
const src = readFileSync(join(process.cwd(), "src/components/SocialShell.jsx"), "utf8");

describe("SocialShell — avance automatique des statuts", () => {
  it("le minuteur passe par une référence toujours à jour de nextStory", () => {
    expect(src).toContain("const nextStoryRef = useRef(nextStory);");
    expect(src).toContain("nextStoryRef.current = nextStory;");
    expect(src).toContain("setTimeout(() => nextStoryRef.current(), storyDurationMs)");
    expect(src).not.toContain("setTimeout(() => nextStory(), storyDurationMs)");
  });
});
