import { OTHER_PROFILE_COLUMNS } from "./otherProfileColumns";

// Requêtes du chargement initial d'une session (App.jsx, loadAll) — extraites
// dans ce module, avec le client Supabase passé en paramètre, pour pouvoir
// tester l'ORDONNANCEMENT des requêtes sans monter App.jsx.

// Requêtes du "graphe social" du compte courant : likes (reçus ET envoyés, pour
// recalculer matches + admirersCount), passes, blocages, plus le profil complet
// des comptes bloqués et la RPC get_my_likers(). Extrait de loadAll() (qui les
// enchaînait inline) pour que resyncSocialGraph() puisse les REJOUER À
// L'IDENTIQUE après une reconnexion réseau, sans retoucher aux ~500 profils /
// ~3200 photos que loadAll() recharge par ailleurs. Ne fait aucun setState ni
// throw : l'appelant décide quoi faire des résultats.
export async function fetchSocialGraph(client, myProfileId) {
  const relFilter = myProfileId ? `from_id.eq.${myProfileId},to_id.eq.${myProfileId}` : null;
  let likeQuery = client.from("likes").select("from_id,to_id");
  let passQuery = client.from("passes").select("from_id,to_id");
  let blockQuery = client.from("blocks").select("from_id,to_id");
  if (relFilter) {
    likeQuery = likeQuery.or(relFilter);
    passQuery = passQuery.or(relFilter);
    blockQuery = blockQuery.or(relFilter);
  }
  // RPC get_my_likers() plutôt qu'une jointure PostgREST directe sur "likes"
  // (voir supabase-premium-admirers-reveal-fix.sql) : is_premium() appliqué
  // côté serveur, profil complet seulement pour un match mutuel ou un compte
  // Premium, sinon un simple compteur sans identité.
  const likerQuery = myProfileId ? client.rpc("get_my_likers") : null;
  // Même correctif que likerQuery, appliqué à la modale "Comptes bloqués" :
  // jointure directe sur "blocks" (from_id = moi) et non un filtre du cache
  // "profiles" plafonné à 500 lignes.
  const blockedQuery = myProfileId
    ? client.from("blocks").select(`to_id, profile:to_id(${OTHER_PROFILE_COLUMNS})`).eq("from_id", myProfileId)
    : null;

  const [likeRes, passRes, blockRes, likerRes, blockedProfRes] = await Promise.all([
    likeQuery,
    passQuery,
    blockQuery,
    likerQuery || Promise.resolve({ data: [], error: null }),
    blockedQuery || Promise.resolve({ data: [], error: null }),
  ]);
  return { likeRes, passRes, blockRes, likerRes, blockedProfRes };
}

// Chargement initial : profils des autres (500) + photos (3200) + propre profil
// + graphe social.
//
// Audit performance (6 oct. 2026) — cascade évitée. Avant : phase 1 (profils 500
// + photos 3200, les deux requêtes les plus lourdes de l'app) PUIS phase 2
// (likes/passes/blocages/admirateurs/bloqués) car l'id du profil courant était
// déduit du lot de 500 profils ; PUIS, une fois loadAll terminé, une requête
// dédiée du propre profil (effet "checking-profile"). Soit 3 allers-retours en
// série (4 pour un compte au-delà des 500 premiers profils : requête de repli
// supplémentaire) avant de pouvoir afficher quoi que ce soit.
// Maintenant : le propre profil (select "*", déjà nécessaire de toute façon) est
// demandé EN MÊME TEMPS que les 2 grosses requêtes ; dès qu'il répond, le graphe
// social part sans attendre le téléchargement des 500 profils/3200 photos. Le
// chemin critique passe de [lourd -> graphe -> propre profil] à
// [max(lourd, propre profil -> graphe)], et le propre profil réutilisé par
// App.jsx supprime la requête dédiée. Le coût réseau total ne change pas, et
// disparaît même pour les comptes au-delà des 500 premiers (plus de requête de
// repli).
// Propre profil complet (select "*"), avec UN nouvel essai en cas d'erreur.
// Avant f8c7b53, un échec ponctuel de cette requête n'aboutissait qu'à l'écran
// "profile-load-error" (bouton Réessayer) sans toucher aux données déjà
// chargées ; depuis qu'elle fait partie du chargement initial, une erreur fait
// échouer tout loadAll() (profils, likes, blocages jetés, Découverte vide si
// la requête dédiée de checking-profile réussit ensuite) pour une coupure d'une
// seconde. Un seul nouvel essai absorbe le cas courant ; si les deux échouent,
// l'erreur est renvoyée telle quelle (jamais traitée comme "aucun profil").
async function fetchOwnProfile(client, authUserId) {
  const run = () => Promise.resolve(client.from("profiles").select("*").eq("user_id", authUserId).maybeSingle());
  const first = await run();
  return first?.error ? run() : first;
}

function skippedSocialGraph(error) {
  const res = () => ({ data: null, error });
  return { likeRes: res(), passRes: res(), blockRes: res(), likerRes: res(), blockedProfRes: res() };
}

export async function fetchInitialData(client) {
  const sessionRes = await client.auth.getSession();
  const authUserId = sessionRes.data?.session?.user?.id || null;

  // Plafonné (item 12/13 de l'audit Phase 10) : charger la table "profiles" en
  // entier sans limite était le plus gros risque de scalabilité identifié — un
  // vrai tri/pagination côté serveur demanderait de déplacer rankCandidates()
  // côté serveur (hors périmètre de cette phase), donc ce plafond borne le pire
  // cas sans changer le comportement de classement actuel.
  // select(OTHER_PROFILE_COLUMNS) et non select("*") (bug corrigé à l'audit —
  // voir lib/otherProfileColumns.js) : ce cache sert à afficher/filtrer les
  // profils des AUTRES utilisateurs (Découverte, tri de compatibilité), jamais
  // le sien propre.
  const profilesQuery = client.from("profiles").select(OTHER_PROFILE_COLUMNS).order("created_at", { ascending: true }).limit(500);
  // Plafonné pour la même raison que "profiles". Trié par profile_id d'abord :
  // 500 profils × MAX_PHOTOS(6) = 3000 au maximum théorique, donc une
  // troncature reste possible en bordure — trier uniquement par "position"
  // rendrait alors la coupe arbitraire (un sous-ensemble différent de photos à
  // chaque reload) ; trier par profile_id la rend déterministe.
  const photosQuery = client.from("profile_photos").select("*").order("profile_id", { ascending: true }).order("position", { ascending: true }).limit(3200);
  // Propre profil complet (select "*") : même requête que l'effet
  // "checking-profile" d'App.jsx, qui réutilise ce résultat.
  const ownPromise = authUserId ? fetchOwnProfile(client, authUserId) : Promise.resolve({ data: null, error: null });
  // likes/passes/blocks n'étaient filtrés par personne (audit complémentaire
  // post-palette) : ces 3 tables croissent indéfiniment avec l'activité de TOUS
  // les utilisateurs. hasLiked/hasPassed/hasBlocked ne sont jamais appelées
  // qu'avec currentUser.id comme l'une des deux extrémités — donc ne charger que
  // les lignes qui l'impliquent, via son profile.id.
  // Si le propre profil est en erreur (même après le nouvel essai de
  // fetchOwnProfile), l'id est inconnu : ne PAS lancer le graphe social, qui
  // partirait sans filtre (likes/passes/blocages de TOUS les comptes) pour un
  // résultat que loadAll() jette de toute façon (ownRes.error => échec).
  const graphPromise = ownPromise.then((ownRes) => (ownRes?.error ? skippedSocialGraph(ownRes.error) : fetchSocialGraph(client, ownRes?.data?.id || null)));

  const [profRes, photoRes, ownRes, graph] = await Promise.all([profilesQuery, photosQuery, ownPromise, graphPromise]);
  return { authUserId, profRes, photoRes, ownRes, ...graph };
}

// Mémo de passage du propre profil, de loadAll() vers l'effet "checking-profile"
// (App.jsx). Valable une seule fois, pour le même compte, et seulement tant que
// le résultat est récent : au-delà (ou après un échec), l'effet refait sa
// propre requête comme avant.
export const OWN_PROFILE_PREFETCH_TTL_MS = 30 * 1000;

export function createOwnProfilePrefetch() {
  let entry = null;
  return {
    // N'enregistre que les résultats SANS erreur et avec un profil : un échec
    // ou "aucun profil" est toujours revérifié par la requête de l'effet.
    store(authUserId, ownRes, now = Date.now()) {
      entry = authUserId && ownRes && !ownRes.error && ownRes.data ? { authUserId, res: ownRes, at: now } : null;
    },
    take(authUserId, now = Date.now()) {
      const e = entry;
      entry = null;
      if (!e || e.authUserId !== authUserId || now - e.at > OWN_PROFILE_PREFETCH_TTL_MS) return null;
      return e.res;
    },
  };
}
