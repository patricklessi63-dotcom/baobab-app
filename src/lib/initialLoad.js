import { OTHER_PROFILE_COLUMNS } from "./otherProfileColumns";
import { selectAllPages, selectInChunks } from "./inChunks";

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
  // Plafond PostgREST (max_rows, 1000 par défaut sur Supabase) : il tronque la
  // réponse SANS erreur. Un compte populaire (likes reçus) ou très actif
  // dépasse 1000 lignes "likes"/"passes" ; surtout, une liste de blocages
  // tronquée ferait RÉAPPARAÎTRE un utilisateur bloqué (Découverte, matches,
  // conversations : blockedIds est calculé d'ici). Chaque requête filtrée par
  // le profil courant est donc paginée par `.order("id").range()` (id unique
  // = pas de doublon ni de trou entre pages). Sans id de profil (compte en
  // onboarding, résultat de toute façon jeté par loadAll), on garde la requête
  // unique historique : paginer toute la table n'aurait aucun sens.
  const relQuery = (table) =>
    relFilter
      ? selectAllPages((from, to) => client.from(table).select("from_id,to_id").or(relFilter).order("id").range(from, to))
      : client.from(table).select("from_id,to_id");
  const likeQuery = relQuery("likes");
  const passQuery = relQuery("passes");
  const blockQuery = relQuery("blocks");
  // RPC get_my_likers() plutôt qu'une jointure PostgREST directe sur "likes"
  // (voir supabase-premium-admirers-reveal-fix.sql) : is_premium() appliqué
  // côté serveur, profil complet seulement pour un match mutuel ou un compte
  // Premium, sinon un simple compteur sans identité.
  const likerQuery = myProfileId ? client.rpc("get_my_likers") : null;
  // Même correctif que likerQuery, appliqué à la modale "Comptes bloqués" :
  // jointure directe sur "blocks" (from_id = moi) et non un filtre du cache
  // "profiles" plafonné à 500 lignes.
  const blockedQuery = myProfileId
    ? selectAllPages((from, to) =>
        client.from("blocks").select(`to_id, profile:to_id(${OTHER_PROFILE_COLUMNS})`).eq("from_id", myProfileId).order("id").range(from, to))
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

// Chargement initial : profils des autres (500) + photos de ces profils (lots de
// 100 ids, lues après les profils) + propre profil + graphe social.
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
// Photos (correctif ultérieur) : elles dépendent maintenant des ids des profils
// chargés, donc partent APRÈS la réponse des profils (5 lots de 100 ids en UNE
// vague parallèle, 1 page chacune). Chemin critique de la partie lourde :
// [profils -> 1 vague de lots] au lieu de max(profils, 4 pages de photos en série
// depuis la pagination par .range) ; le graphe social ne les attend pas.
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

// Photos de galerie du chargement initial : lues APRÈS les profils (voir
// fetchInitialData), par lots d'ids de ces profils. Lot de 100 : 100 profils x
// MAX_PHOTOS (6) = 600 lignes < 1000 (plafond PostgREST), donc une seule page
// par lot ; selectAllPages ne pagine qu'en cas de débordement. Concurrence 5 :
// les 500 profils (5 lots) partent en UNE vague.
export const PHOTOS_LOT_SIZE = 100;
const PHOTOS_CONCURRENCY = 5;

async function fetchPhotosForProfiles(client, profRes, ownRes) {
  // Échec des profils : loadAll lève sur profRes.error avant de lire les photos.
  if (profRes?.error) return { data: null, error: profRes.error };
  // Ids des profils effectivement chargés + propre profil (absent des 500 plus
  // anciens pour un compte récent ; sa galerie sert à l'édition du profil).
  // Une erreur du propre profil est ignorée ici (loadAll la traite à part).
  const ids = new Set((profRes?.data || []).map((p) => p.id).filter(Boolean));
  const ownId = ownRes && !ownRes.error ? ownRes.data?.id : null;
  if (ownId) ids.add(ownId);
  const { data, errors } = await selectInChunks(
    [...ids],
    (lot) =>
      selectAllPages((from, to) =>
        client
          .from("profile_photos")
          .select("*")
          .in("profile_id", lot)
          .order("profile_id", { ascending: true })
          .order("position", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      ),
    { size: PHOTOS_LOT_SIZE, concurrency: PHOTOS_CONCURRENCY }
  );
  // Comme avant : un lot en échec = échec du chargement (jamais une galerie partielle).
  if (errors.length) return { data: null, error: errors[0] };
  return { data, error: null };
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
  // Photos : lues APRÈS les profils, avec .in("profile_id", ids de CES profils)
  // par lots (fetchPhotosForProfiles). Avant, lecture globale dans l'ordre de
  // profile_id avec une borne de 3200 lignes, sans lien avec les 500 profils
  // chargés (les plus anciens par created_at) : au-delà de ~500 comptes, des
  // profils chargés n'avaient pas leur galerie et des photos de profils non
  // chargés occupaient la borne. Seules les photos dépendent des profils : le
  // graphe social, lui, ne les attend pas (voir plus bas).
  // Propre profil complet (select "*") : même requête que l'effet
  // "checking-profile" d'App.jsx, qui réutilise ce résultat.
  const profPromise = Promise.resolve(profilesQuery);
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

  const photosPromise = Promise.all([profPromise, ownPromise]).then(([profRes, ownRes]) => fetchPhotosForProfiles(client, profRes, ownRes));

  const [profRes, photoRes, ownRes, graph] = await Promise.all([profPromise, photosPromise, ownPromise, graphPromise]);
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
