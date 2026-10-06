// Garde « session utilisable » avant un rattrapage de données (retour en ligne,
// reprise après veille).
//
// Pourquoi (audit réseau, 6 oct. 2026) : après une longue veille, le jeton
// d'accès (~1 h) est expiré. Quand supabase-js n'arrive pas à le rafraîchir
// (réseau encore instable au réveil), `getSession()` renvoie session = null et
// le client RETOMBE SUR LA CLÉ ANONYME pour la requête suivante
// (SupabaseClient#_getAccessToken -> supabaseKey). Sous RLS, une lecture
// anonyme ne renvoie pas d'erreur : elle renvoie une liste VIDE. Un rattrapage
// lancé à ce moment-là remplaçait alors la conversation ouverte, les likes, les
// aperçus et les badges par du vide — l'inverse de l'effet recherché.
//
// getSession() attend la fin d'un rafraîchissement en cours (verrou interne) :
// si la session est utilisable après cet appel, les requêtes qui suivent partent
// bien avec un jeton valide. Sinon on saute ce rattrapage ; le prochain
// évènement online / la prochaine reprise réessaiera.
//
// Tolérant : sans client ou sans auth.getSession (tests, environnement
// atypique) ou en cas d'exception, on autorise le rattrapage (comportement
// antérieur).
export async function hasUsableSession(client) {
  try {
    if (!client?.auth?.getSession) return true;
    const { data } = await client.auth.getSession();
    return Boolean(data?.session);
  } catch (_) {
    return true;
  }
}
