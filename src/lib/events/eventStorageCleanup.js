// Fichiers Storage d'un événement supprimé définitivement.
//
// Défaut corrigé (audit du 25 novembre 2026) : supprimer un événement retire la ligne
// "events" ; event_media, event_staff, etc. partent en cascade (supabase-events-v2.sql),
// mais les fichiers des buckets privés "event-covers" (couverture) et "event-media"
// (photos partagées) restaient pour toujours dans le stockage : stockage payé, et photos
// de personnes qui subsistaient après la disparition de l'événement.
//
// Les deux buckets rangent les fichiers sous "<id de l'événement>/<fichier>"
// (EventCreateForm, EventEditForm, EventPhotoGallery). Ordre imposé par les policies :
//   1. LISTER avant la suppression : la lecture repose sur can_view_event(), qui ne
//      répond plus une fois l'événement supprimé ;
//   2. supprimer la ligne "events" (elle fait foi : si ce DELETE échoue, aucun fichier
//      n'a été touché) ;
//   3. retirer les fichiers, au mieux. Le Storage n'efface que ce que la policy DELETE
//      autorise : les fichiers dont la personne est propriétaire (sa couverture, ses
//      photos). Les photos des autres participants ne sont plus effaçables par le
//      client (le droit de l'équipe, is_event_mod, disparaît avec la cascade de
//      event_staff) : la requête d'orphelins de supabase-event-media-mod-delete.sql
//      les retrouve pour un nettoyage par l'API Storage.
// Aucune de ces fonctions ne lève : un échec de nettoyage ne doit jamais faire croire
// que la suppression de l'événement a échoué.

export const EVENT_STORAGE_BUCKETS = ["event-covers", "event-media"];

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const REMOVE_BATCH = 100;

function isSafeFolder(id) {
  return typeof id === "string" && id.length > 0 && !id.includes("/") && id !== "." && id !== "..";
}

/** Chemins complets ("<id>/<fichier>") des fichiers du dossier de l'événement dans un bucket. */
export async function listEventFolder(client, bucket, eventId) {
  if (!isSafeFolder(eventId)) return [];
  const paths = [];
  const seen = new Set();
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await client.storage.from(bucket).list(eventId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      if (error) {
        console.error("Listage Storage de l'événement échoué", bucket, error);
        break;
      }
      const batch = Array.isArray(data) ? data : [];
      // Une page qui ne contient que des noms déjà vus (offset ignoré) arrête la lecture.
      if (batch.length > 0 && batch.every((f) => seen.has(f?.name))) break;
      for (const f of batch) {
        const name = f?.name;
        seen.add(name);
        // Les entrées sans id sont des sous-dossiers (jamais créés par l'app) : ignorées.
        if (typeof name !== "string" || !name || f.id == null) continue;
        paths.push(`${eventId}/${name}`);
      }
      if (batch.length < PAGE_SIZE) break;
    }
  } catch (e) {
    console.error("Listage Storage de l'événement échoué", bucket, e);
  }
  return paths;
}

/** À appeler AVANT de supprimer l'événement. Renvoie { bucket: [chemins] }. */
export async function collectEventStoragePaths(client, eventId) {
  const out = {};
  for (const bucket of EVENT_STORAGE_BUCKETS) out[bucket] = await listEventFolder(client, bucket, eventId);
  return out;
}

/** À appeler APRÈS la suppression confirmée. Renvoie le nombre de fichiers réellement retirés. */
export async function removeEventStorage(client, collected) {
  let removed = 0;
  for (const bucket of EVENT_STORAGE_BUCKETS) {
    const paths = Array.isArray(collected?.[bucket]) ? collected[bucket] : [];
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      try {
        const { data, error } = await client.storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH));
        if (error) console.error("Nettoyage Storage de l'événement partiel", bucket, error);
        removed += Array.isArray(data) ? data.length : 0;
      } catch (e) {
        console.error("Nettoyage Storage de l'événement échoué", bucket, e);
      }
    }
  }
  return removed;
}
