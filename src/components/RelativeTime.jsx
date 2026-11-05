import React from "react";
import { useMinuteTick } from "../hooks/useMinuteTick";

// Heure relative qui VIEILLIT toute seule (« Vu il y a 5 min » devient « Vu il y a 6 min » sans rechargement ni
// nouveau message). Seul ce petit texte est redessiné, une fois par minute et seulement quand l'onglet est visible ;
// au retour sur l'onglet, il est recalculé tout de suite. `format` : (valeur ISO) => texte.
export default function RelativeTime({ value, format }) {
  useMinuteTick();
  return <>{format(value)}</>;
}
