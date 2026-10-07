import { PUBLIC_WEB_ORIGIN } from "./publicOrigin";

// Liens profonds (App Links Android / Universal Links iOS) et URLs de
// notification (`data.url`) -> destination dans l'app.
//
// L'app n'a pas de routeur : ce module ne fait QUE valider une URL et la
// traduire en destination {kind, id} ; c'est App.jsx / SocialShell.jsx qui
// ouvrent ensuite l'écran avec les mécanismes existants (fiche profil,
// conversation, détail d'événement/communauté), dont les requêtes passent par
// la RLS : un lien vers une entité inaccessible ou supprimée affiche un message
// « indisponible », jamais un crash ni une fuite.
//
// SÉCURITÉ : liste blanche stricte. Seules sont acceptées
//   https://<domaine public>/event/<uuid>
//   https://<domaine public>/community/<uuid>
//   https://<domaine public>/profile/<uuid>
//   https://<domaine public>/messages/<uuid du profil de l'autre personne>
// (ou le même chemin relatif, tel que posé dans data.url par send-push). Tout le
// reste — autre domaine, autre schéma, identifiant qui n'est pas un uuid, chemin
// inconnu, nom d'utilisateur dans l'URL (https://domaine@evil.com), chemin
// relatif en `//` ou `/\` — est refusé (null). Requête et fragment sont ignorés.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY_PATH_RE = /^\/(event|community|profile|messages)\/([^/]+)\/?$/;
const MAX_ENTITY_URL_LENGTH = 2048;
// Un lien de récupération contient deux JWT dans le fragment : on accepte plus long.
const MAX_AUTH_URL_LENGTH = 8192;
const TOKEN_RE = /^[A-Za-z0-9._~+/=-]{1,4096}$/;

/** Résout `input` contre l'origine publique ; null si l'origine résultante n'est pas EXACTEMENT la nôtre. */
function resolveSameOrigin(input, origin, maxLength) {
  if (typeof input !== "string" || input.length === 0 || input.length > maxLength) return null;
  let url;
  try {
    url = new URL(input, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  if (url.username || url.password) return null;
  return url;
}

/** @returns {{kind: "event"|"community"|"profile"|"messages", id: string} | null} */
export function parseDeepLink(input, origin = PUBLIC_WEB_ORIGIN) {
  const url = resolveSameOrigin(input, origin, MAX_ENTITY_URL_LENGTH);
  if (!url) return null;
  const m = ENTITY_PATH_RE.exec(url.pathname);
  if (!m || !UUID_RE.test(m[2])) return null;
  return { kind: m[1], id: m[2].toLowerCase() };
}

/**
 * Liens d'authentification reçus par e-mail (Supabase, flux implicite : jetons
 * dans le fragment). Retourne :
 *  - {type: "recovery", accessToken, refreshToken} : /update-password#access_token=…&refresh_token=…&type=recovery
 *  - {type: "verified"}  : /?verified=1 (confirmation d'adresse e-mail ; les jetons ne sont PAS utilisés)
 *  - {type: "error", code} : #error=…&error_code=otp_expired (lien expiré/invalide)
 *  - null sinon.
 * Les jetons ne doivent JAMAIS être journalisés ni envoyés à un suivi : ce module
 * n'écrit rien nulle part et ne les met que dans la valeur de retour.
 */
export function parseAuthLink(input, origin = PUBLIC_WEB_ORIGIN) {
  const url = resolveSameOrigin(input, origin, MAX_AUTH_URL_LENGTH);
  if (!url) return null;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

  if (hash.get("error") || hash.get("error_code")) {
    const code = hash.get("error_code") || "";
    return { type: "error", code: /^[a-z_]{1,64}$/.test(code) ? code : "invalid_link" };
  }
  if (url.pathname === "/update-password") {
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (hash.get("type") === "recovery" && accessToken && refreshToken && TOKEN_RE.test(accessToken) && TOKEN_RE.test(refreshToken)) {
      return { type: "recovery", accessToken, refreshToken };
    }
    return null;
  }
  if (url.pathname === "/" && url.searchParams.get("verified") === "1") return { type: "verified" };
  return null;
}
