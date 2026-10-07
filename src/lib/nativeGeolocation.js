import { isNative, getPlatform } from "./platform";

// Géolocalisation NATIVE (app Capacitor Android/iOS) — étape 3b.
//
// RÈGLE : sur le web, RIEN de ce fichier ne s'exécute. geolocation.js n'appelle
// ces fonctions que derrière isNative() et le plugin @capacitor/geolocation est
// chargé par import() dynamique (chunk séparé, jamais téléchargé par un
// navigateur) — même modèle que nativeUi.js / nativeApp.js / nativePush.js.
//
// Pourquoi passer par le plugin plutôt que navigator.geolocation (qui marche
// dans les WebViews) : permission demandée PROPREMENT (états prompt / refusée
// définitivement distincts, jamais de « page web qui demande »), alias
// « coarseLocation » (localisation APPROXIMATIVE seulement : Android n'affiche
// pas le choix précise/approximative et ACCESS_FINE_LOCATION n'est pas
// déclarée), et un état de permission FIABLE pour le garde-fou d'accès
// (navigator.permissions.query est incomplet dans les WebViews).
//
// Même interface que geolocation.js : { ok:true, latitude, longitude } ou
// { ok:false, code, message } avec les MÊMES codes (PERMISSION_DENIED,
// POSITION_UNAVAILABLE, TIMEOUT, UNKNOWN) — aucun appelant n'a à changer.
// L'arrondi à 2 décimales reste fait par geolocation.js (ce module renvoie les
// coordonnées brutes à geolocation.js, qui ne les expose jamais telles quelles).

const MAXIMUM_AGE_MS = 5 * 60 * 1000;
// Marge ajoutée au délai du plugin pour qu'un plugin qui ne répond jamais ne
// laisse pas une promesse pendante indéfiniment (le délai du plugin ne court
// qu'APRÈS l'obtention de la permission : la fenêtre système n'est jamais bornée).
const SAFETY_MARGIN_MS = 3000;

/** Chemin manuel vers le réglage de localisation de l'app (aucune API fiable pour ouvrir les réglages). */
export function locationSettingsPath() {
  return getPlatform() === "ios"
    ? "Réglages, Confidentialité et sécurité, Service de localisation, Baobab"
    : "Réglages, Applications, Baobab, Autorisations, Position";
}

export const NATIVE_LOCATION_MESSAGES = {
  // Remplace le message générique web (« dans les paramètres ») : ici on sait où aller.
  PERMISSION_DENIED: () => `Tu peux activer la localisation plus tard dans les réglages de ton téléphone (${locationSettingsPath()}).`,
  SERVICES_OFF: "La localisation de ton téléphone est désactivée. Active-la dans les réglages, puis réessaie.",
};

async function loadPlugin() {
  const { Geolocation } = await import("@capacitor/geolocation");
  return Geolocation;
}

// Codes d'erreur structurés du plugin (README « Errors »), avec repli sur le texte.
const DENIED_CODES = new Set(["OS-PLUG-GLOC-0003", "OS-PLUG-GLOC-0008"]);
const TIMEOUT_CODES = new Set(["OS-PLUG-GLOC-0010"]);
// 0009 : refus de la fenêtre système « activer la localisation » (services éteints, pas un refus de l'app).
const SERVICES_OFF_CODES = new Set(["OS-PLUG-GLOC-0007", "OS-PLUG-GLOC-0009", "OS-PLUG-GLOC-0017"]);
const UNAVAILABLE_CODES = new Set(["OS-PLUG-GLOC-0002", "OS-PLUG-GLOC-0014", "OS-PLUG-GLOC-0015", "OS-PLUG-GLOC-0016"]);

/** Erreur du plugin -> { ok:false, code, message } (codes de geolocation.js, jamais le message technique brut). */
export function mapNativeLocationError(err, messages) {
  const code = typeof err?.code === "string" ? err.code : "";
  const text = String(err?.message || "");
  const denied = { ok: false, code: "PERMISSION_DENIED", message: NATIVE_LOCATION_MESSAGES.PERMISSION_DENIED() };
  const servicesOff = { ok: false, code: "POSITION_UNAVAILABLE", message: NATIVE_LOCATION_MESSAGES.SERVICES_OFF };
  // Codes structurés d'abord (fiables), puis repli sur le texte.
  if (DENIED_CODES.has(code)) return denied;
  if (SERVICES_OFF_CODES.has(code)) return servicesOff;
  if (TIMEOUT_CODES.has(code)) return { ok: false, code: "TIMEOUT", message: messages.TIMEOUT };
  if (UNAVAILABLE_CODES.has(code)) return { ok: false, code: "POSITION_UNAVAILABLE", message: messages.POSITION_UNAVAILABLE };
  if (/enable location|services? (are )?(not )?enabled|turned off|disabled/i.test(text)) return servicesOff;
  if (/denied|restricted/i.test(text)) return denied;
  if (/in time|timeout|timed out/i.test(text)) return { ok: false, code: "TIMEOUT", message: messages.TIMEOUT };
  return { ok: false, code: "UNKNOWN", message: messages.UNKNOWN };
}

// "prompt-with-rationale" (Android : refusée une fois, on peut redemander) = « à redemander ».
function normalizeState(status) {
  const s = status?.coarseLocation ?? status?.location;
  if (s === "granted") return "granted";
  if (s === "denied") return "denied";
  return "prompt";
}

/**
 * État de la permission de localisation : "granted" | "prompt" | "denied", ou
 * null si on ne sait pas (web, plugin indisponible, services de localisation
 * du téléphone désactivés — ce n'est PAS un refus de l'app). Jamais d'exception.
 */
export async function checkNativeLocationPermission() {
  if (!isNative()) return null;
  try {
    const Geolocation = await loadPlugin();
    return normalizeState(await Geolocation.checkPermissions());
  } catch {
    return null;
  }
}

/**
 * Position actuelle (APPROXIMATIVE : enableHighAccuracy false). Demande la
 * permission seulement si elle est à l'état « prompt » ; l'appelant a déjà
 * affiché son texte d'explication (modale de consentement, texte d'inscription)
 * AVANT d'arriver ici. Permission refusée = aucune fenêtre système, retour immédiat.
 * `messages` = LOCATION_ERROR_MESSAGES de geolocation.js (injecté : pas d'import circulaire).
 */
export async function getNativeCoordinates({ timeout = 10000, messages }) {
  try {
    const Geolocation = await loadPlugin();
    let state = normalizeState(await Geolocation.checkPermissions());
    if (state === "prompt") {
      state = normalizeState(await Geolocation.requestPermissions({ permissions: ["coarseLocation"] }));
    }
    if (state !== "granted") {
      return { ok: false, code: "PERMISSION_DENIED", message: NATIVE_LOCATION_MESSAGES.PERMISSION_DENIED() };
    }
    let timer;
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject({ code: "OS-PLUG-GLOC-0010", message: "timeout" }), timeout + SAFETY_MARGIN_MS);
    });
    try {
      const position = await Promise.race([
        Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout, maximumAge: MAXIMUM_AGE_MS }),
        guard,
      ]);
      const { latitude, longitude } = position?.coords || {};
      if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return { ok: false, code: "POSITION_UNAVAILABLE", message: messages.POSITION_UNAVAILABLE };
      }
      return { ok: true, latitude, longitude };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return mapNativeLocationError(err, messages);
  }
}
