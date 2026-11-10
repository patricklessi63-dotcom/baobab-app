import { supabase } from "../../supabaseClient";

// Collections privées de publications (SQL-38, avantage Premium). Le client ne
// fait qu'appeler la base : le droit de CRÉER (collection ou ajout) est vérifié
// côté serveur par la RLS (has_premium_feature). Lire, retirer et supprimer
// restent possibles après la fin de l'abonnement.

export const COLLECTION_NAME_MAX = 40;
export const MAX_COLLECTIONS = 20;

// Message lisible pour une erreur Postgres/RLS. `null` si l'erreur n'est pas connue :
// l'appelant affiche alors son message générique.
export function collectionErrorMessage(error) {
  const text = `${error?.message || ""} ${error?.code || ""}`;
  if (/COLLECTION_ITEM_LIMIT/.test(text)) return "Cette collection est pleine (500 publications au maximum).";
  if (/COLLECTION_LIMIT/.test(text)) return "Tu as atteint la limite de 20 collections.";
  if (error?.code === "23505" || /duplicate key|unique/i.test(text)) return "Une collection porte déjà ce nom.";
  if (error?.code === "42501" || /row-level security/i.test(text)) return "Cette fonction est réservée aux abonnés Premium.";
  if (error?.code === "42P01" || /does not exist|schema cache|PGRST205/i.test(text)) return "Les collections ne sont pas encore disponibles.";
  return null;
}

// Nom nettoyé, ou `null` si inutilisable (vide ou trop long).
export function cleanCollectionName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > COLLECTION_NAME_MAX) return null;
  return name;
}

export async function listCollections() {
  const { data, error } = await supabase
    .from("post_collections")
    .select("id, name, created_at, items:post_collection_items(post_id)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((c) => ({ id: c.id, name: c.name, postIds: (c.items || []).map((i) => i.post_id) }));
}

export async function createCollection(ownerId, rawName) {
  const name = cleanCollectionName(rawName);
  if (!name) throw Object.assign(new Error("Nom de collection invalide."), { code: "INVALID_NAME" });
  const { data, error } = await supabase.from("post_collections").insert({ owner_id: ownerId, name }).select("id, name").single();
  if (error) throw error;
  return { id: data.id, name: data.name, postIds: [] };
}

export async function deleteCollection(collectionId) {
  const { error } = await supabase.from("post_collections").delete().eq("id", collectionId);
  if (error) throw error;
}

export async function addToCollection(ownerId, collectionId, postId) {
  const { error } = await supabase.from("post_collection_items").insert({ owner_id: ownerId, collection_id: collectionId, post_id: postId });
  // Déjà rangée : le résultat voulu est atteint, ce n'est pas une erreur.
  if (error && error.code !== "23505") throw error;
}

export async function removeFromCollection(collectionId, postId) {
  const { error } = await supabase.from("post_collection_items").delete().eq("collection_id", collectionId).eq("post_id", postId);
  if (error) throw error;
}

// Aperçus des publications rangées dans une collection (les règles de lecture de
// `posts` s'appliquent : blocages, suppression). Une publication devenue illisible
// n'apparaît simplement pas.
export async function loadCollectionPosts(postIds) {
  if (!postIds?.length) return [];
  const { data, error } = await supabase
    .from("posts")
    .select("id, body, created_at, profiles(name)")
    .in("id", postIds.slice(0, 500))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
