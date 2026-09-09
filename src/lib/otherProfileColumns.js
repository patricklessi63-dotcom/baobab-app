// Colonnes de "profiles" pour un profil D'UN AUTRE UTILISATEUR — jamais pour
// son PROPRE profil, qui doit continuer de charger select("*") (voir
// App.jsx). Extrait dans ce fichier partagé (audit du 8 septembre) : la
// même liste servait déjà App.jsx (cache candidats/Découverte, comptes
// bloqués) et devait être réutilisée telle quelle par SocialShell.jsx, qui
// avait le même bug sur d'autres requêtes réseau ciblant un profil tiers
// (fiche de profil ouverte depuis une notification, ouverture de
// conversation depuis une notification, réponse à un statut, recherche
// globale) — même famille de bug que
// supabase-likers-profile-overexposure-fix.sql, mais côté client : un
// select("*") sur "profiles" expose dans la réponse réseau brute, à TOUT
// utilisateur connecté, des colonnes jamais destinées à un autre compte que
// son titulaire (ban_reason, suspend_reason, report_count,
// flagged_for_review, notification_preferences, birth_date exact...), même
// si aucun composant ne les affiche jamais à l'écran.
//
// Liste dérivée d'une recherche exhaustive des champs réellement lus sur un
// profil tiers (DiscoverTab.jsx, MatchCard.jsx, ProfileCard.jsx,
// PublicProfileModal.jsx, ConversationCard.jsx, ConversationPane.jsx,
// matchingService.js, matchesSearch()/searchResults de SocialShell.jsx) —
// PLUS banned_at/suspended_until/onboarding_completed_at/dating_enabled/
// deletion_requested_at, dont App.jsx a besoin pour le filtre dur de
// "candidates" (comptes bannis/suspendus/incomplets/en attente de
// suppression exclus de Découverte) : il n'existe pas ici de filtrage
// équivalent côté serveur (contrairement au RPC get_my_likers()), donc ces
// colonnes doivent transiter jusqu'au client pour que ce filtre fonctionne.
export const OTHER_PROFILE_COLUMNS = [
  "id", "name", "age", "city", "country", "languages", "arrived_since",
  "looking_for", "bio", "created_at",
  "avatar_url", "cover_url", "occupation", "education_level", "interests",
  "is_online", "last_seen", "show_online_status",
  "email_verified", "phone_verified", "is_founder", "is_premium", "show_birth_year",
  "show_city", "show_country", "show_occupation", "show_studies",
  "show_canada_journey", "show_life_project", "show_interests",
  "immigration_status", "arrival_city", "languages_detail", "relationship_values",
  "wants_children", "family_importance", "career_goal", "geographic_openness",
  "dating_enabled", "banned_at", "suspended_until", "onboarding_completed_at",
  "deletion_requested_at",
].join(",");
