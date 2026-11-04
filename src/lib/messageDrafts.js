// Brouillons de messages : le texte non envoyé d'une conversation survit à un rechargement, à une
// fermeture accidentelle de l'onglet ou au passage dans une autre conversation. Stockage local
// (localStorage) : aucun service externe, rien n'est envoyé au serveur.
//
// - Un brouillon par conversation ET par compte : clé `bb-draft:<monId>:<idDeLAutre>` (un autre
//   compte sur le même appareil ne voit jamais le brouillon du premier).
// - Expire après 30 jours ; plafonné à MAX_DRAFT_LENGTH caractères (le message est de toute façon limité).
// - Tous les accès sont protégés : stockage indisponible / plein / navigation privée => on ignore
//   silencieusement (la messagerie fonctionne comme avant, sans brouillon).
// - Vidé à la déconnexion volontaire (clearAllDrafts) ; conservé si la session expire (on ne
//   fait pas perdre de texte à quelqu'un dont le jeton a simplement expiré).

const PREFIX = "bb-draft:";
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_DRAFT_LENGTH = 5000;

const keyOf = (userId, otherId) => `${PREFIX}${userId}:${otherId}`;

function storage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// Texte du brouillon, ou "" s'il n'y en a pas, s'il a expiré ou s'il est illisible.
export function loadDraft(userId, otherId, now = Date.now()) {
  if (!userId || !otherId) return "";
  const s = storage();
  if (!s) return "";
  try {
    const raw = s.getItem(keyOf(userId, otherId));
    if (!raw) return "";
    const { t, ts } = JSON.parse(raw);
    if (typeof t !== "string" || typeof ts !== "number" || now - ts > DRAFT_TTL_MS) {
      s.removeItem(keyOf(userId, otherId));
      return "";
    }
    return t.slice(0, MAX_DRAFT_LENGTH);
  } catch {
    return "";
  }
}

// Enregistre le brouillon ; un texte vide (ou que des espaces) supprime l'entrée.
export function saveDraft(userId, otherId, text, now = Date.now()) {
  if (!userId || !otherId) return;
  const s = storage();
  if (!s) return;
  try {
    if (typeof text !== "string" || !text.trim()) {
      s.removeItem(keyOf(userId, otherId));
      return;
    }
    s.setItem(keyOf(userId, otherId), JSON.stringify({ t: text.slice(0, MAX_DRAFT_LENGTH), ts: now }));
  } catch {
    /* stockage plein ou indisponible : pas de brouillon, rien d'autre à faire */
  }
}

export function clearDraft(userId, otherId) {
  saveDraft(userId, otherId, "");
}

// Supprime tous les brouillons de cet appareil (déconnexion volontaire).
export function clearAllDrafts() {
  const s = storage();
  if (!s) return;
  try {
    const keys = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* ignoré */
  }
}
