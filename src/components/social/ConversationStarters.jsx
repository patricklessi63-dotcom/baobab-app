import React from "react";
import { MessageCircle } from "lucide-react";
import { computeMatch } from "../../lib/matching/matchingService";
import { primary, bg, body, primaryRgb } from "./theme";

// Génère jusqu'à 3 suggestions d'ouverture, uniquement à partir de données
// réellement communes entre les deux profils (jamais inventées). Repli sur
// une phrase générique si rien de commun n'est trouvé.
function buildStarters(currentUser, match) {
  const result = computeMatch(currentUser, match);
  // "name" est déjà le prénom seul (Step1Identity.jsx sépare "Nom" de
  // famille dans last_name) — split(" ")[0] coupait à tort un prénom
  // composé sans trait d'union ("Marie Claude", "Ana Maria").
  const firstName = match.name?.trim() || "toi";
  const suggestions = [];

  if (result.commonInterests.length >= 2) {
    const [a, b] = result.commonInterests;
    suggestions.push(`On dirait qu'on a plusieurs points communs, dont ${a} et ${b}. Lequel te passionne le plus ?`);
  } else if (result.commonInterests.length === 1) {
    suggestions.push(`Vous aimez tous les deux ${result.commonInterests[0]} ! Depuis quand ça te passionne ?`);
  }

  if (result.sharedIntentions.length > 0) {
    suggestions.push(`Vous cherchez tous les deux « ${result.sharedIntentions[0]} » ici. Qu'est-ce qui t'a donné envie de t'inscrire sur Baobab ?`);
  }

  // Confidentialité par champ (voir PrivacyFieldsModal.jsx) — cette suggestion
  // nommait la ville/le pays de "match" sans consulter show_city/show_country,
  // alors que scoreLocation() (matchingService.js) applique déjà ce garde pour
  // le même calcul "même ville/pays" : un match ayant masqué sa ville se la
  // voyait quand même révélée ici, dans une phrase toute faite.
  const matchCity = match.show_city === false ? "" : match.city;
  const matchCountry = match.show_country === false ? "" : match.country;
  const sameCity = currentUser.city && matchCity && currentUser.city.trim().toLowerCase() === matchCity.trim().toLowerCase();
  const sameCountry = currentUser.country && matchCountry && currentUser.country.trim().toLowerCase() === matchCountry.trim().toLowerCase();
  if (sameCity) {
    suggestions.push(`Vous êtes tous les deux à ${matchCity} ! Tu es arrivé(e) depuis combien de temps ?`);
  } else if (sameCountry) {
    suggestions.push(`Vous venez tous les deux de ${matchCountry} ! Qu'est-ce qui te manque le plus de là-bas ?`);
  }

  if (suggestions.length === 0) {
    suggestions.push(`Salut ${firstName} ! Qu'est-ce qui t'a motivé(e) à rejoindre Baobab ?`);
  }

  return suggestions.slice(0, 3);
}

export default function ConversationStarters({ currentUser, match, onPick }) {
  if (!currentUser || !match) return null;
  const starters = buildStarters(currentUser, match);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1" style={{ color: primary }}>
        <MessageCircle size={13} /> Question pour briser la glace
      </div>
      {starters.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="text-left text-xs px-3.5 py-3 rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{ background: bg, color: body, border: `1px solid rgba(${primaryRgb},.06)` }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
