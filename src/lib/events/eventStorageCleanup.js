// Fichiers Storage d'un événement supprimé définitivement.
//
// Défaut corrigé (audit du 25 novembre 2026) : supprimer un événement retire la ligne
// "events" ; event_media, event_staff, etc. partent en cascade (supabase-events-v2.sql),
// mais les fichiers des buckets privés "event-covers" (couverture) et "event-media"
// (photos partagées) restaient pour toujours dans le stockage : stockage payé, et photos
// de personnes qui subsistaient après la disparition de l'événement.
//
// Les deux buckets rangent les fichiers sous "<id de l'événement>/<fichier>"
// (EventCreateForm, EventEditForm, EventPhotoGallery). Ordre et garanties : voir
// ../storageFolderCleanup.js. Les photos des autres participants ne sont plus effaçables
// par le client après la suppression (le droit de l'équipe, is_event_mod, disparaît avec
// la cascade de event_staff) : la requête d'orphelins de
// supabase-event-media-mod-delete.sql les retrouve pour un nettoyage par l'API Storage.

import { listFolderPaths, removeCollectedPaths } from "../storageFolderCleanup";

export const EVENT_STORAGE_BUCKETS = ["event-covers", "event-media"];

/** Chemins complets ("<id>/<fichier>") des fichiers du dossier de l'événement dans un bucket. */
export const listEventFolder = listFolderPaths;

/** À appeler AVANT de supprimer l'événement. Renvoie { bucket: [chemins] }. */
export async function collectEventStoragePaths(client, eventId) {
  const out = {};
  for (const bucket of EVENT_STORAGE_BUCKETS) out[bucket] = await listFolderPaths(client, bucket, eventId);
  return out;
}

/** À appeler APRÈS la suppression confirmée. Renvoie le nombre de fichiers réellement retirés. */
export function removeEventStorage(client, collected) {
  const only = {};
  for (const bucket of EVENT_STORAGE_BUCKETS) only[bucket] = collected?.[bucket];
  return removeCollectedPaths(client, only);
}
