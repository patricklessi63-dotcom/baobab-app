import { supabase } from "../supabaseClient";
import { MEDIA_BUCKET } from "./mediaConstants";

const TTL_SECONDS = 3600;
const SAFETY_MARGIN_MS = 60000;

const cache = new Map(); // path -> { url, expiresAt }
// Requêtes en attente ou en vol, indexées par path — voir getSignedUrl.
const inflight = new Map(); // path -> Promise<string|null>

// Audit performance (6 oct. 2026) — N+1 : chaque bulle média d'une conversation
// (useSignedMediaUrl, un hook par message) appelait getSignedUrl() pour son
// propre chemin, donc ouvrir une conversation de 30 messages dont 20 photos
// déclenchait 20 POST /object/sign séparés (getSignedUrls(), pourtant écrit
// pour ça, n'était appelé nulle part). Les appels émis dans la même fenêtre
// (BATCH_WINDOW_MS : tous les effets d'un même rendu React partent dans le
// même tick) sont désormais regroupés en UN SEUL createSignedUrls() ; un
// chemin isolé part toujours par createSignedUrl() comme avant.
const BATCH_WINDOW_MS = 10;
const pending = new Map(); // path -> resolve(url|null), en attente du prochain flush
let flushTimer = null;

async function flushPending() {
  flushTimer = null;
  const batch = new Map(pending);
  pending.clear();
  const paths = [...batch.keys()];
  const resolved = {};
  try {
    // handleOperation() (storage-js) ne convertit en { data:null, error }
    // que les erreurs "storage" reconnues — une vraie coupure réseau (fetch
    // qui lève un TypeError, DNS, CORS...) est relancée telle quelle, donc
    // ces appels PEUVENT rejeter, pas seulement renvoyer un champ error. Sans
    // ce try/catch, le moindre aléa réseau faisait planter la promesse
    // retournée par getSignedUrl : ses deux appelants (useSignedMediaUrl,
    // qui ne pose pas de .catch, et openFile dans MessageBubbleMedia, qui
    // l'attend sans try/catch) restaient alors bloqués indéfiniment —
    // spinner de chargement figé sur l'image/vidéo/audio d'un message, ou
    // bouton "Ouvrir le fichier" désactivé pour de bon après un simple aléa
    // réseau, sans jamais réessayer même une fois la connexion revenue.
    if (paths.length === 1) {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(paths[0], TTL_SECONDS);
      if (!error && data?.signedUrl) resolved[paths[0]] = data.signedUrl;
    } else {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, TTL_SECONDS);
      if (!error && data) {
        for (const row of data) {
          if (row.signedUrl && row.path) resolved[row.path] = row.signedUrl;
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  for (const [path, resolve] of batch) {
    const url = resolved[path] || null;
    if (url) cache.set(path, { url, expiresAt: Date.now() + TTL_SECONDS * 1000 - SAFETY_MARGIN_MS });
    inflight.delete(path);
    resolve(url);
  }
}

// Oublie l'URL signée en cache d'un chemin (ex. l'image a échoué à charger :
// URL expirée côté serveur alors que le cache local la croit encore valable —
// onglet resté ouvert, horloge du téléphone décalée). Le prochain
// getSignedUrl(path) en redemande une neuve.
export function invalidateSignedUrl(path) {
  cache.delete(path);
}

export function getSignedUrl(path) {
  if (!path) return Promise.resolve(null);
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);

  // Le cache local est vide/expiré : si une résolution pour ce même path est
  // déjà en attente ou en cours (ex. un message dont la bulle média est
  // démontée puis remontée avant la fin du premier aller-retour réseau, en
  // cas de scroll rapide dans une liste virtualisée, ou un double-mount React
  // en dev), on réutilise cette requête au lieu d'en relancer une deuxième en
  // parallèle vers Supabase pour exactement le même chemin.
  const existing = inflight.get(path);
  if (existing) return existing;

  const promise = new Promise((resolve) => { pending.set(path, resolve); });
  inflight.set(path, promise);
  if (!flushTimer) flushTimer = setTimeout(flushPending, BATCH_WINDOW_MS);
  return promise;
}

// Résolution groupée — un seul aller-retour pour toutes les images/vidéos/
// audios d'une conversation au premier chargement, plutôt qu'un appel par message.
export async function getSignedUrls(paths) {
  const uncached = paths.filter((p) => {
    const cached = cache.get(p);
    return !cached || cached.expiresAt <= Date.now();
  });
  if (uncached.length > 0) {
    try {
      // Même risque de rejet qu'au-dessus (voir le commentaire dans
      // flushPending) : sans ce try/catch, un aléa réseau ferait rejeter
      // toute la promesse renvoyée par getSignedUrls au lieu de simplement
      // laisser les chemins non résolus à null dans le résultat.
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(uncached, TTL_SECONDS);
      if (!error && data) {
        for (const row of data) {
          if (row.signedUrl && row.path) {
            cache.set(row.path, { url: row.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 - SAFETY_MARGIN_MS });
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  const result = {};
  for (const p of paths) result[p] = cache.get(p)?.url || null;
  return result;
}
