import { isNative } from "./platform";

// Partage NATIF (app Capacitor Android/iOS) via @capacitor/share — étape 3b.
//
// RÈGLE : sur le web, RIEN de ce fichier ne s'exécute (shareNative() renvoie
// { unsupported: true } sans rien charger) ; chaque site de partage garde son code
// web tel quel (navigator.share / presse-papiers) et n'appelle ce module que
// derrière isNative(). Le plugin est chargé par import() dynamique.
//
// Pourquoi : la WebView Android n'expose pas navigator.share (le bouton copiait
// silencieusement dans le presse-papiers) ; la feuille de partage système apporte
// le vrai choix d'application. Ce module ne décide JAMAIS de ce qui est partagé :
// chaque appelant passe le contenu déjà validé par ses propres règles.
//
// Le lien partagé est toujours le domaine PUBLIC (linkOrigin() /
// PUBLIC_WEB_ORIGIN), jamais https://localhost (origine de la WebView). Garde-fou ici
// aussi : une `url` dont l'hôte est local, ou non http(s), est retirée du partage
// (le texte part seul) plutôt que d'envoyer un lien inutilisable.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/** URL http(s) publique, ou null (hôte local, schéma inattendu, valeur invalide). */
export function publicShareUrl(url) {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Ouvre la feuille de partage du système. Retourne
 *   { ok:true }                — partage lancé (la feuille a été utilisée)
 *   { ok:false, cancelled }    — l'utilisateur a fermé la feuille : PAS une erreur, ne rien afficher
 *   { ok:false, busy }         — une feuille est déjà ouverte : ignorer
 *   { ok:false, unsupported }  — web, ou partage indisponible : l'appelant garde son repli
 *   { ok:false, error }        — échec réel : l'appelant bascule sur son repli (copie du lien)
 * Jamais d'exception.
 */
export async function shareNative({ title, text, url, dialogTitle } = {}) {
  if (!isNative()) return { ok: false, unsupported: true };
  try {
    const { Share } = await import("@capacitor/share");
    try {
      const can = await Share.canShare();
      if (can && can.value === false) return { ok: false, unsupported: true };
    } catch { /* canShare indisponible : on tente quand même le partage */ }
    const payload = { title, text, dialogTitle };
    const safeUrl = publicShareUrl(url);
    if (safeUrl) payload.url = safeUrl;
    // Rien d'autre que du contenu explicite : pas de fichiers, jamais de métadonnées.
    await Share.share(payload);
    return { ok: true };
  } catch (err) {
    const message = String(err?.message || err || "");
    if (/cancel/i.test(message)) return { ok: false, cancelled: true };
    if (/in progress/i.test(message)) return { ok: false, busy: true };
    return { ok: false, error: true };
  }
}
