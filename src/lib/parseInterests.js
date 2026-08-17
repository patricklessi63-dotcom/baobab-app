// profiles.interests est stocké comme une chaîne texte séparée par
// virgules (pas un tableau réel) — voir App.jsx, matchingService.js et
// profileCompletion.js, qui réimplémentent chacun ce parsing
// indépendamment. Nouvel utilitaire partagé pour la Phase 6 uniquement
// (les 3 sites existants ne sont pas retouchés, hors périmètre).
export function parseInterests(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
