// Système de version Baobab — voir public/app-version.json pour la source
// unique de "ce qui est disponible" et vite.config.js pour "ce qui tourne
// actuellement" (injecté depuis package.json à la compilation, jamais
// dupliqué en dur ici ou ailleurs).

export const CURRENT_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min — jamais plus agressif
const DISMISS_KEY_PREFIX = "baobab:updateDismissedAt:";
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // ne reproposer qu'après 24h

// Comparaison MAJEURE.MINEURE.CORRECTIF simple — pas de dépendance externe
// pour ça, le format est toujours strict à 3 nombres dans ce projet.
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

// Cache-bust systématique — un CDN/navigateur qui garderait en cache
// l'ancien app-version.json rendrait toute la détection inutile (exactement
// le piège décrit à l'item 19 du cahier des charges).
export async function fetchLatestVersionInfo() {
  const res = await fetch(`/app-version.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`app-version.json indisponible (${res.status})`);
  return res.json();
}

// Ne bloque jamais l'app si la vérification échoue (item 15) — retourne
// simplement "rien à signaler" plutôt que de jeter, l'appelant n'a pas à
// gérer un cas d'erreur séparé.
export async function checkForUpdate() {
  try {
    const info = await fetchLatestVersionInfo();
    const mandatory = Boolean(info.minimumVersion) && compareVersions(CURRENT_VERSION, info.minimumVersion) < 0;
    const recommended = !mandatory && compareVersions(CURRENT_VERSION, info.latestVersion) < 0;
    return { ok: true, mandatory, recommended, info };
  } catch (e) {
    console.error(e);
    return { ok: false, mandatory: false, recommended: false, info: null };
  }
}

function dismissKey(version) {
  return `${DISMISS_KEY_PREFIX}${version}`;
}

// "Plus tard" ne doit reproposer ni à chaque seconde ni à chaque relance
// (item 11) — un cooldown par version ciblée : si une version ENCORE plus
// récente sort entre-temps, elle redemande normalement (nouvelle clé).
export function wasRecentlyDismissed(latestVersion) {
  try {
    const raw = localStorage.getItem(dismissKey(latestVersion));
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < DISMISS_COOLDOWN_MS;
  } catch (_) {
    return false;
  }
}

export function dismissUpdate(latestVersion) {
  try {
    localStorage.setItem(dismissKey(latestVersion), String(Date.now()));
  } catch (_) {}
}

export { CHECK_INTERVAL_MS };
