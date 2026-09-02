import { supabase } from "../supabaseClient";
import { MEDIA_BUCKET } from "./mediaConstants";

const TTL_SECONDS = 3600;
const SAFETY_MARGIN_MS = 60000;

const cache = new Map(); // path -> { url, expiresAt }

export async function getSignedUrl(path) {
  if (!path) return null;
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  try {
    // handleOperation() (storage-js) ne convertit en { data:null, error }
    // que les erreurs "storage" reconnues — une vraie coupure réseau (fetch
    // qui lève un TypeError, DNS, CORS...) est relancée telle quelle, donc
    // cet appel PEUT rejeter, pas seulement renvoyer un champ error. Sans ce
    // try/catch, le moindre aléa réseau faisait planter la promesse
    // retournée par getSignedUrl : ses deux appelants (useSignedMediaUrl,
    // qui ne pose pas de .catch, et openFile dans MessageBubbleMedia, qui
    // l'attend sans try/catch) restaient alors bloqués indéfiniment —
    // spinner de chargement figé sur l'image/vidéo/audio d'un message, ou
    // bouton "Ouvrir le fichier" désactivé pour de bon après un simple aléa
    // réseau, sans jamais réessayer même une fois la connexion revenue.
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 - SAFETY_MARGIN_MS });
    return data.signedUrl;
  } catch (e) {
    console.error(e);
    return null;
  }
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
      // getSignedUrl) : sans ce try/catch, un aléa réseau ferait rejeter
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
