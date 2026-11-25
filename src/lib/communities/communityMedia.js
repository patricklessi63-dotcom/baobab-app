// Médias des publications de communauté (bucket PRIVÉ "community-media", voir supabase-communities-3.sql).
//
// Faille corrigée à l'audit du 25 nov. 2026 : la colonne community_posts.media_url recevait une URL
// signée valable 5 ANS. Une URL signée Storage ne se révoque pas : un membre exclu d'une communauté
// privée (ou quiconque à qui le lien avait circulé) gardait l'accès à la photo/vidéo pendant 5 ans,
// et un média dont le fichier n'avait pas pu être supprimé (suppression par un modérateur, cf.
// cleanupCommunityMediaUrl) restait consultable par ce lien.
//
// Désormais : le lien enregistré ne vit que COMMUNITY_MEDIA_URL_TTL, et chaque chargement de la liste
// re-signe les médias pour la personne qui regarde (la policy SELECT du bucket vérifie alors à chaque
// fois que la communauté est publique ou que la personne en est membre). Le FORMAT de l'URL enregistrée
// ne change pas (…/object/sign/community-media/<communauté>/<fichier>?token=…) : la suppression de
// compte (process-scheduled-deletions → storagePathFromUrl) et le nettoyage client continuent de
// retrouver le chemin, sans redéploiement.

import { MEMBER_MEDIA_URL_TTL } from "../mediaUrlTtl";

export const COMMUNITY_MEDIA_BUCKET = "community-media";
export const COMMUNITY_MEDIA_URL_TTL = MEMBER_MEDIA_URL_TTL; // 24 h : re-signé à chaque chargement de la liste

/** Chemin d'objet (sans jeton) d'une URL du bucket community-media, ou null. Même règle que storagePathFromUrl (Edge). */
export function communityMediaPath(url) {
  if (typeof url !== "string" || !url) return null;
  const marker = `/${COMMUNITY_MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let path;
  try {
    path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
  } catch {
    return null;
  }
  if (!path || path.startsWith("/") || path.split("/").some((seg) => seg === ".." || seg === "")) return null;
  return path;
}

/**
 * Renvoie une copie des publications dont media_url est remplacée par une URL fraîchement signée
 * (TTL court). Ne lève jamais : en cas d'échec (réseau, droit refusé pour un fichier), la publication
 * garde son URL enregistrée — le fil s'affiche quand même, seul le média concerné peut ne pas charger.
 */
export async function resignCommunityPosts(client, posts) {
  const list = Array.isArray(posts) ? posts : [];
  const paths = [...new Set(list.map((p) => communityMediaPath(p?.media_url)).filter(Boolean))];
  if (paths.length === 0) return list;
  const fresh = new Map();
  try {
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { data, error } = await client.storage.from(COMMUNITY_MEDIA_BUCKET).createSignedUrls(batch, COMMUNITY_MEDIA_URL_TTL);
      if (error) { console.warn("Médias de communauté : re-signature impossible", error); continue; }
      for (const row of data || []) {
        if (row?.path && row?.signedUrl && !row.error) fresh.set(row.path, row.signedUrl);
      }
    }
  } catch (e) {
    console.warn("Médias de communauté : re-signature impossible", e);
  }
  if (fresh.size === 0) return list;
  return list.map((p) => {
    const path = communityMediaPath(p?.media_url);
    const url = path && fresh.get(path);
    return url ? { ...p, media_url: url } : p;
  });
}
