import { supabase } from "../supabaseClient";
import { MEDIA_BUCKET } from "./mediaConstants";

const TTL_SECONDS = 3600;
const SAFETY_MARGIN_MS = 60000;

const cache = new Map(); // path -> { url, expiresAt }

export async function getSignedUrl(path) {
  if (!path) return null;
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 - SAFETY_MARGIN_MS });
  return data.signedUrl;
}

// Résolution groupée — un seul aller-retour pour toutes les images/vidéos/
// audios d'une conversation au premier chargement, plutôt qu'un appel par message.
export async function getSignedUrls(paths) {
  const uncached = paths.filter((p) => {
    const cached = cache.get(p);
    return !cached || cached.expiresAt <= Date.now();
  });
  if (uncached.length > 0) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(uncached, TTL_SECONDS);
    if (!error && data) {
      for (const row of data) {
        if (row.signedUrl && row.path) {
          cache.set(row.path, { url: row.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 - SAFETY_MARGIN_MS });
        }
      }
    }
  }
  const result = {};
  for (const p of paths) result[p] = cache.get(p)?.url || null;
  return result;
}
