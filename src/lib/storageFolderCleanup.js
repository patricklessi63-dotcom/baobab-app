// Nettoyage Storage d'un contenu supprimé définitivement (événement, communauté).
//
// Schéma commun, imposé par les policies Storage :
//   1. LISTER le dossier "<id>/" AVANT la suppression de la ligne : la lecture dépend
//      d'une fonction (can_view_event, visibilité de la communauté) qui ne répond plus
//      une fois la ligne supprimée ;
//   2. supprimer la ligne (elle fait foi : si ce DELETE échoue, aucun fichier n'est touché) ;
//   3. retirer les fichiers au mieux. Le Storage n'efface que ce que la policy DELETE
//      autorise (en pratique : les fichiers dont la personne est propriétaire).
// Aucune de ces fonctions ne lève : un échec de nettoyage ne doit jamais faire croire que
// la suppression elle-même a échoué.

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const REMOVE_BATCH = 100;

function isSafeFolder(id) {
  return typeof id === "string" && id.length > 0 && !id.includes("/") && id !== "." && id !== "..";
}

/** Chemins complets ("<dossier>/<fichier>") des fichiers d'un dossier, toutes pages lues. */
export async function listFolderPaths(client, bucket, folder) {
  if (!isSafeFolder(folder)) return [];
  const paths = [];
  const seen = new Set();
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await client.storage.from(bucket).list(folder, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      if (error) {
        console.error("Listage Storage échoué", bucket, error);
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
        paths.push(`${folder}/${name}`);
      }
      if (batch.length < PAGE_SIZE) break;
    }
  } catch (e) {
    console.error("Listage Storage échoué", bucket, e);
  }
  return paths;
}

/** Retire { bucket: [chemins] } par lots. Renvoie le nombre de fichiers réellement effacés. */
export async function removeCollectedPaths(client, collected) {
  let removed = 0;
  for (const [bucket, list] of Object.entries(collected || {})) {
    const paths = Array.isArray(list) ? list : [];
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      try {
        const { data, error } = await client.storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH));
        if (error) console.error("Nettoyage Storage partiel", bucket, error);
        removed += Array.isArray(data) ? data.length : 0;
      } catch (e) {
        console.error("Nettoyage Storage échoué", bucket, e);
      }
    }
  }
  return removed;
}
