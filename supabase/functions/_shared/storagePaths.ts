// Utilitaires purs (aucun import Deno : testables sous Vitest) pour retrouver un
// chemin de fichier Storage à partir de l'URL stockée en base.
//
// Les médias de communauté (community_posts.media_url) sont stockés sous forme
// d'URL SIGNÉE (bucket privé, voir supabase-communities-3.sql) du type
//   https://<projet>.supabase.co/storage/v1/object/sign/community-media/<communauté>/<fichier>?token=...
// et non d'un chemin brut : pour supprimer le fichier à la suppression d'un compte
// (process-scheduled-deletions), on extrait le chemin comme le fait déjà le client
// (CommunitiesTab.jsx, cleanupCommunityMediaUrl).

/** Renvoie le chemin d'objet (sans jeton ni requête) d'une URL de bucket donné, ou null. */
export function storagePathFromUrl(url: unknown, bucket: string): string | null {
  if (typeof url !== "string" || !url || !bucket) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length).split("?")[0];
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Refuse un chemin vide ou qui sortirait du dossier (jamais de ".." ni de "//").
  if (!path || path.startsWith("/") || path.split("/").some((seg) => seg === ".." || seg === "")) return null;
  return path;
}

/** Chemins uniques et valides d'une liste de lignes `{ media_url }`. */
export function uniqueStoragePaths(rows: Array<{ media_url?: unknown }> | null | undefined, bucket: string): string[] {
  const set = new Set<string>();
  for (const row of rows || []) {
    const p = storagePathFromUrl(row?.media_url, bucket);
    if (p) set.add(p);
  }
  return [...set];
}

/** Découpe une liste en lots (remove() de Storage : lots raisonnables). */
export function chunkList<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type ListFn = (prefix: string, opts: { limit: number; offset: number }) => Promise<{ data: Array<{ name: string }> | null; error?: unknown }>;

/**
 * Liste TOUS les fichiers d'un dossier Storage, page par page. `storage.list()` ne
 * renvoie que 100 entrées par défaut : sans pagination, un compte qui a plus de 100
 * fichiers dans son dossier (photos, statuts, médias de publication) en gardait le
 * reste après sa suppression. Une erreur de listage est remontée (jamais un résultat
 * partiel silencieux).
 */
export async function listAllFileNames(list: ListFn, prefix: string, pageSize = 100, maxPages = 1000): Promise<string[]> {
  const names: string[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await list(prefix, { limit: pageSize, offset: page * pageSize });
    if (error) throw error;
    const batch = data || [];
    for (const f of batch) names.push(f.name);
    if (batch.length < pageSize) break;
  }
  return names;
}
