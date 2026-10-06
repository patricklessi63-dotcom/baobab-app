// Classification des erreurs de requête Supabase/PostgREST côté client.
//
// postgrest-js ne LÈVE pas en cas de coupure réseau : il renvoie
// `{ error: { message: "TypeError: Failed to fetch", code: "" } }`. Une erreur
// renvoyée par le serveur (contrainte, RLS, trigger P0001...) porte, elle,
// toujours un `code` (SQLSTATE ou PGRSTxxx). Une réponse de passerelle
// (502/504, HTML) n'en a pas non plus.
//
// Conséquence importante : « pas de code » signifie que le client NE SAIT PAS
// si la requête a été exécutée côté serveur (réponse perdue, timeout client,
// coupure en plein vol). Pour une écriture, c'est le cas où un renvoi risque de
// créer un doublon, et où supprimer le fichier uploadé juste avant risque de
// casser une ligne qui, elle, existe.

const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|network error|fetch failed|timeout|timed out|abort/i;

// L'issue d'une écriture est incertaine (la requête a peut-être été appliquée).
export function isAmbiguousWriteError(e) {
  if (!e) return false;
  return !e.code;
}

// La requête n'a manifestement pas pu joindre le serveur (ou a expiré) :
// à présenter comme un problème de réseau plutôt qu'une erreur technique brute.
export function isNetworkFailure(e) {
  if (!e || e.code) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return NETWORK_MESSAGE.test(String(e.message || e));
}

export function networkFailureMessage() {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "Pas de connexion internet."
    : "Connexion instable : la requête n'a pas abouti.";
}
