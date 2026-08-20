// Wrapper autour de l'API navigateur officielle (navigator.geolocation) —
// jamais de position simulée. Erreurs mappées en français compréhensible,
// jamais le message technique brut du navigateur affiché à l'utilisateur.
export const LOCATION_ERROR_MESSAGES = {
  PERMISSION_DENIED: "Tu peux activer la localisation plus tard dans les paramètres.",
  POSITION_UNAVAILABLE: "Ta position n'a pas pu être déterminée. Réessaie dans un instant.",
  TIMEOUT: "La demande de localisation a pris trop de temps. Réessaie.",
  UNSUPPORTED: "Ton navigateur ne prend pas en charge la géolocalisation.",
  UNKNOWN: "Impossible de récupérer ta position pour le moment.",
};

const ERROR_CODE_NAMES = { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" };

// Précision volontairement réduite à 2 décimales (~1,1 km) avant même de
// quitter l'appareil — minimisation des données, jamais de GPS exact envoyé.
export function roundCoordinate(value) {
  return Math.round(value * 100) / 100;
}

export function getCurrentPositionSafe({ timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ ok: false, code: "UNSUPPORTED", message: LOCATION_ERROR_MESSAGES.UNSUPPORTED });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
        });
      },
      (err) => {
        const code = ERROR_CODE_NAMES[err.code] || "UNKNOWN";
        resolve({ ok: false, code, message: LOCATION_ERROR_MESSAGES[code] });
      },
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60 * 1000 }
    );
  });
}
