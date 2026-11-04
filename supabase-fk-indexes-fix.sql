-- ============================================================================
-- SQL-29 — Index sur les clés étrangères qui n'en ont pas (43 index).
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Audit de base de données du 4 novembre 2026 (structure exportée de la production, rejouée sur la
-- répétition) : 43 clés étrangères n'ont aucun index sur leur colonne. Conséquences :
--   - supprimer un profil (suppression de compte, cascade ou « set null » sur ces tables) parcourt
--     TOUTE chaque table concernée : lent et long verrouillage dès que les tables grossissent ;
--   - les jointures / filtres par auteur, communauté, événement… n'ont aucun index.
-- Le fichier supabase-indexes-launch-fix.sql (SQL-4) couvre déjà les 12 chemins les plus chauds ; ceci
-- complète le reste.
--
-- ADDITIF et IDEMPOTENT : uniquement des « create index if not exists » (aucune donnée, aucune policy,
-- aucune contrainte touchée). Chaque création verrouille brièvement les ÉCRITURES de sa table (taille
-- actuelle : quelques milliers de lignes au plus -> fraction de seconde) : à lancer hors heures de
-- pointe. Coût de stockage négligeable. CREATE INDEX CONCURRENTLY n'est pas utilisable dans le SQL Editor
-- (transaction).
-- RETOUR ARRIÈRE : drop index if exists public.<nom>; (les noms sont préfixés « idx_ »).
-- ============================================================================

create index if not exists idx_admin_actions_actor_id on public.admin_actions (actor_id);
create index if not exists idx_beta_feedback_profile_id on public.beta_feedback (profile_id);
create index if not exists idx_client_errors_profile_id on public.client_errors (profile_id);
create index if not exists idx_communities_created_by on public.communities (created_by);
create index if not exists idx_community_comments_author_id on public.community_comments (author_id);
create index if not exists idx_community_comments_reply_to_id on public.community_comments (reply_to_id);
create index if not exists idx_community_invites_invited_by on public.community_invites (invited_by);
create index if not exists idx_community_join_requests_decided_by on public.community_join_requests (decided_by);
create index if not exists idx_community_post_likes_profile_id on public.community_post_likes (profile_id);
create index if not exists idx_community_posts_author_id on public.community_posts (author_id);
create index if not exists idx_community_reports_community_id on public.community_reports (community_id);
create index if not exists idx_community_reports_from_id on public.community_reports (from_id);
create index if not exists idx_event_comments_author_id on public.event_comments (author_id);
create index if not exists idx_event_invitations_invited_by on public.event_invitations (invited_by);
create index if not exists idx_event_media_event_id on public.event_media (event_id);
create index if not exists idx_event_media_uploaded_by on public.event_media (uploaded_by);
create index if not exists idx_event_reports_event_id on public.event_reports (event_id);
create index if not exists idx_event_reports_from_id on public.event_reports (from_id);
create index if not exists idx_event_staff_profile_id on public.event_staff (profile_id);
create index if not exists idx_events_created_by on public.events (created_by);
create index if not exists idx_immigration_news_favorites_news_id on public.immigration_news_favorites (news_id);
create index if not exists idx_info_article_revisions_edited_by on public.info_article_revisions (edited_by);
create index if not exists idx_info_articles_approved_by on public.info_articles (approved_by);
create index if not exists idx_info_articles_created_by on public.info_articles (created_by);
create index if not exists idx_info_articles_published_by on public.info_articles (published_by);
create index if not exists idx_info_bookmarks_profile_id on public.info_bookmarks (profile_id);
create index if not exists idx_info_reports_article_id on public.info_reports (article_id);
create index if not exists idx_info_reports_from_id on public.info_reports (from_id);
create index if not exists idx_message_reactions_profile_id on public.message_reactions (profile_id);
create index if not exists idx_messages_from_id on public.messages (from_id);
create index if not exists idx_messages_reply_to_id on public.messages (reply_to_id);
create index if not exists idx_notifications_actor_id on public.notifications (actor_id);
create index if not exists idx_notifications_community_id on public.notifications (community_id);
create index if not exists idx_platform_roles_granted_by on public.platform_roles (granted_by);
create index if not exists idx_post_comments_author_id on public.post_comments (author_id);
create index if not exists idx_post_likes_profile_id on public.post_likes (profile_id);
create index if not exists idx_post_reports_from_id on public.post_reports (from_id);
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);
create index if not exists idx_recommendation_feedback_profile_id on public.recommendation_feedback (profile_id);
create index if not exists idx_reports_from_id on public.reports (from_id);
create index if not exists idx_reports_to_id on public.reports (to_id);
create index if not exists idx_story_reactions_profile_id on public.story_reactions (profile_id);
create index if not exists idx_story_views_viewer_id on public.story_views (viewer_id);
