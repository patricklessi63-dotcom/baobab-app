// fetch avec délai maximal pour les requêtes de données (PostgREST).
//
// Audit réseau (6 oct. 2026) : supabase-js n'impose AUCUN délai. Sur un réseau
// « lie-fi » (Wi-Fi sans internet, tunnel de métro, signal faible), navigator.onLine
// reste vrai alors que la requête ne reçoit jamais de réponse : le navigateur ne
// l'abandonne qu'après plusieurs minutes. Pendant ce temps le spinner de
// chargement initial tourne indéfiniment, un message reste « envoi... », un
// bouton reste désactivé. Un délai de 45 s (le plafond de statement_timeout côté
// Supabase est de 8 s pour un utilisateur connecté, une réponse saine n'en
// approche jamais) transforme ce blocage en échec ordinaire — traité comme
// n'importe quelle coupure : erreur sans code, vérification avant renvoi (voir
// messageGhost.js / writeRecovery.js), nouvel essai au retour du réseau.
//
// Seules les requêtes /rest/v1/ sont concernées : les uploads Storage (gros
// fichiers, progression propre), les Edge Functions (délai propre, ai-assist),
// l'authentification et le temps réel gardent leur comportement.
export const REST_TIMEOUT_MS = 45 * 1000;

export function createTimeoutFetch(baseFetch, timeoutMs = REST_TIMEOUT_MS) {
  const doFetch = baseFetch || ((...args) => fetch(...args));
  return (input, init) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (!url.includes("/rest/v1/")) return doFetch(input, init);

    const controller = new AbortController();
    const upstream = init?.signal;
    let onUpstreamAbort;
    if (upstream) {
      if (upstream.aborted) controller.abort(upstream.reason);
      else {
        onUpstreamAbort = () => controller.abort(upstream.reason);
        upstream.addEventListener("abort", onUpstreamAbort, { once: true });
      }
    }
    const timer = setTimeout(() => {
      const reason = new Error("La requête a expiré (réseau trop lent).");
      reason.name = "TimeoutError";
      controller.abort(reason);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      if (upstream && onUpstreamAbort) upstream.removeEventListener("abort", onUpstreamAbort);
    };
    return doFetch(input, { ...init, signal: controller.signal }).then(
      (response) => { cleanup(); return response; },
      (error) => { cleanup(); throw error; }
    );
  };
}
