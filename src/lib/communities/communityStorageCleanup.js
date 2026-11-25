// Fichiers Storage d'une communauté supprimée définitivement.
//
// Défaut corrigé (audit du 25 novembre 2026, même famille que la suppression d'événement) :
// supprimer une communauté retire la ligne "communities" ; community_posts et
// community_members partent en cascade, mais
//   - les médias des publications restaient dans le bucket privé "community-media",
//     sous "<id de la communauté>/<fichier>" (CommunitiesTab, handleSubmitPost) ;
//   - la couverture restait dans le bucket "avatars", sous
//     "<user_id du créateur>/community-<horodatage>.<ext>" (CommunityCreateForm).
// Ordre et garanties : voir ../storageFolderCleanup.js. Le Storage n'efface que les
// fichiers dont la personne est propriétaire ; les médias publiés par d'autres membres
// restent pour la requête d'orphelins de supabase-community-media-mod-delete.sql (le droit
// de modération disparaît avec la cascade de community_members).

import { listFolderPaths, removeCollectedPaths } from "../storageFolderCleanup";
import { COMMUNITY_MEDIA_BUCKET } from "./communityMedia";

export const COMMUNITY_COVER_BUCKET = "avatars";

/**
 * Chemin de la couverture dans le bucket avatars, ou null. N'accepte QUE
 * "<dossier>/community-<…>" : une photo de profil (même dossier) n'est jamais visée.
 */
export function communityCoverPath(url) {
  if (typeof url !== "string" || !url) return null;
  const marker = `/${COMMUNITY_COVER_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let path;
  try {
    path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
  } catch {
    return null;
  }
  const parts = path.split("/");
  if (parts.length !== 2) return null;
  const [folder, name] = parts;
  if (!folder || folder === "." || folder === ".." || !name.startsWith("community-") || name.includes("..")) return null;
  return path;
}

/** À appeler AVANT de supprimer la communauté. Renvoie { bucket: [chemins] }. */
export async function collectCommunityStoragePaths(client, community) {
  const cover = communityCoverPath(community?.cover_url);
  return {
    [COMMUNITY_MEDIA_BUCKET]: await listFolderPaths(client, COMMUNITY_MEDIA_BUCKET, community?.id),
    [COMMUNITY_COVER_BUCKET]: cover ? [cover] : [],
  };
}

/** À appeler APRÈS la suppression confirmée. Renvoie le nombre de fichiers réellement retirés. */
export function removeCommunityStorage(client, collected) {
  return removeCollectedPaths(client, {
    [COMMUNITY_MEDIA_BUCKET]: collected?.[COMMUNITY_MEDIA_BUCKET],
    [COMMUNITY_COVER_BUCKET]: collected?.[COMMUNITY_COVER_BUCKET],
  });
}
