import { selectAllPages } from "./inChunks";

// Requêtes de « Exporter mes données » (App.jsx, handleExportData), extraites
// pour pouvoir tester la pagination sans monter App.jsx.
//
// Plafond PostgREST (max_rows, 1000 par défaut sur Supabase) : une réponse est
// tronquée SANS erreur. Un export qui s'arrête à 1000 messages (ou 1000 likes
// reçus...) est incomplet sans que ni l'utilisateur ni `failedCategories` ne le
// sachent — or c'est l'exercice du droit d'accès (LPRPDE/RGPD). Chaque
// catégorie est donc paginée par `.order("id").range()` ; toutes ces tables ont
// une colonne `id` unique (tri stable : ni doublon ni trou entre pages).
// `maxPages` à 200 (200 000 lignes par catégorie) plutôt que les 50 par défaut :
// un export ne doit pas être borné avant l'archive d'un compte très actif.
//
// Colonnes demandées : voir les commentaires historiques dans App.jsx —
// media_path (messages), media_url/media_kind (publications de communauté),
// seul from_id de l'autre participant pour les messages reçus (jamais son profil).
const EXPORT_MAX_PAGES = 200;

export function exportCategories(userId) {
  return {
    posts: (c) => c.from("posts").select("*").eq("author_id", userId),
    photos: (c) => c.from("profile_photos").select("*").eq("profile_id", userId),
    stories: (c) => c.from("stories").select("*").eq("profile_id", userId),
    event_participations: (c) => c.from("event_attendees").select("event_id, status, created_at").eq("profile_id", userId),
    community_memberships: (c) => c.from("community_members").select("community_id, role, created_at").eq("profile_id", userId),
    messages_sent: (c) => c.from("messages").select("id, match_key, kind, text, media_path, created_at").eq("from_id", userId),
    // "messages" n'a pas de colonne to_id : conversation identifiée par match_key
    // ("idA__idB" trié), d'où le filtre ilike (policy RLS de lecture des deux participants).
    messages_received: (c) =>
      c.from("messages")
        .select("id, match_key, kind, text, media_path, from_id, created_at")
        .neq("from_id", userId)
        .or(`match_key.ilike.${userId}__%,match_key.ilike.%__${userId}`),
    post_comments: (c) => c.from("post_comments").select("id, post_id, body, created_at").eq("author_id", userId),
    community_posts: (c) => c.from("community_posts").select("id, community_id, body, media_url, media_kind, created_at").eq("author_id", userId),
    community_comments: (c) => c.from("community_comments").select("id, post_id, body, created_at").eq("author_id", userId),
    likes_sent: (c) => c.from("likes").select("to_id, created_at").eq("from_id", userId),
    likes_received: (c) => c.from("likes").select("from_id, created_at").eq("to_id", userId),
    passes_sent: (c) => c.from("passes").select("to_id, created_at").eq("from_id", userId),
    favorites: (c) => c.from("favorites").select("to_id, created_at").eq("from_id", userId),
    following: (c) => c.from("follows").select("to_id, created_at").eq("from_id", userId),
    followers: (c) => c.from("follows").select("from_id, created_at").eq("to_id", userId),
    blocks: (c) => c.from("blocks").select("to_id, created_at").eq("from_id", userId),
    reports_submitted: (c) => c.from("reports").select("to_id, category, reason, created_at").eq("from_id", userId),
  };
}

// Renvoie `{ keys, results }` : `results[i]` = `{ data, error }` de `keys[i]`
// (même forme que les réponses Supabase lues auparavant par handleExportData).
export async function fetchExportData(client, userId) {
  const categories = exportCategories(userId);
  const keys = Object.keys(categories);
  const results = await Promise.all(
    keys.map((k) =>
      selectAllPages((from, to) => categories[k](client).order("id").range(from, to), { maxPages: EXPORT_MAX_PAGES })
    )
  );
  return { keys, results };
}
