// Catégories de signalement par type de contenu — UNE source par table, alignée
// sur la contrainte CHECK de la base (jamais une valeur que la base refuserait :
// l'INSERT échouerait avec une erreur générique et l'utilisateur ne pourrait pas
// signaler).
//
//  - reports (profils)      : supabase-report-minor-category.sql
//  - post_reports (fil)     : supabase-feed-posts.sql (jamais élargie à ce jour :
//                             pas de « mineur_suspecte » ; voir
//                             supabase-post-report-minor-category.sql, livré mais à
//                             exécuter par le propriétaire — une fois exécuté, ajouter
//                             « mineur_suspecte » à POST_REPORT_CATEGORIES)
//  - community_reports      : communityConfig.js (COMMUNITY_REPORT_CATEGORIES)
//  - event_reports          : eventConfig.js (EVENT_REPORT_CATEGORIES)

export const PROFILE_REPORT_CATEGORIES = [
  { value: "harcelement", label: "Harcèlement" },
  { value: "spam", label: "Spam" },
  { value: "faux_profil", label: "Faux profil" },
  { value: "contenu_inapproprie", label: "Contenu inapproprié" },
  { value: "arnaque", label: "Arnaque" },
  // Catégorie à part (pas fondue dans "faux profil") : priorité de
  // traitement la plus haute (prompt-securite-verification-moderation-baobab.md)
  // — voir la mise à jour correspondante d'admin_list_reports() qui trie ces
  // signalements en premier.
  { value: "mineur_suspecte", label: "Mineur suspecté" },
  { value: "autre", label: "Autre" },
];

// post_reports.category : 'harcelement','spam','faux_profil','contenu_inapproprie','arnaque','autre'.
export const POST_REPORT_CATEGORIES = PROFILE_REPORT_CATEGORIES.filter((c) => c.value !== "mineur_suspecte");
