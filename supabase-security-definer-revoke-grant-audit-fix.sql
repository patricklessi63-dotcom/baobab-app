-- ============================================================================
-- CROISEMENT EXHAUSTIF — pattern "fonction RPC security definer jamais
-- protégée par revoke/grant" (suite de supabase-existence-oracle-fix.sql,
-- qui avait trouvé ce trou sur join_event()/accept_join_request()/
-- reject_join_request()). Cette passe relit TOUTES les fonctions
-- "security definer" du dépôt (version la plus récente de chacune) et
-- vérifie, pour chacune, l'existence d'un "revoke ... from public" suivi
-- d'un "grant execute ... to authenticated" (ou équivalent).
--
-- MÉTHODE DE VÉRIFICATION EXPLOITÉE, PAS SEULEMENT LUE : rappel que
-- PostgreSQL accorde EXECUTE à PUBLIC (donc au rôle "anon" ET "authenticated"
-- de Supabase) sur toute fonction, par défaut, dès sa création — un simple
-- "grant execute ... to authenticated" ajouté PLUS TARD ne retire jamais ce
-- droit hérité de PUBLIC ; seul un "revoke ... from public" explicite le
-- fait. Deux familles de trous trouvées ici :
--   A. Aucun grant ET aucun revoke n'a jamais existé (comme join_event()
--      avant son correctif) — fonctions listées en sections 1 et 2.
--   B. Un "grant execute ... to authenticated" a bien été ajouté (dans
--      supabase-geolocation.sql / supabase-geolocation-privacy-fix.sql /
--      supabase-likers-profile-overexposure-fix.sql / supabase-premium-
--      admirers-reveal-fix.sql / supabase-schema-cache-404-400-fix.sql),
--      mais SANS jamais retirer le droit hérité de PUBLIC avant — donc le
--      rôle "anon" (visiteur non connecté, clé publique) a QUAND MÊME pu
--      exécuter ces fonctions depuis le tout début, malgré l'intention
--      affichée dans ces fichiers. Section 3.
--
-- VERDICT DÉTAILLÉ PAR FONCTION (toutes les fonctions "security definer" du
-- dépôt ont été passées en revue ; seules celles listées ci-dessous manquent
-- de protection — voir le résumé final envoyé à l'utilisateur pour la liste
-- complète des fonctions déjà protégées et de celles jugées non applicables,
-- ex. les fonctions déclenchées uniquement par trigger — "returns trigger"
-- — que PostgreSQL empêche déjà d'appeler directement via RPC, donc hors de
-- portée de ce pattern par construction).
--
-- Aucune connexion active, aucune ligne modifiée par ce fichier lui-même :
-- uniquement des "revoke"/"grant" sur des fonctions déjà déployées. À
-- exécuter manuellement (jamais par l'agent) via l'éditeur SQL Supabase,
-- dans l'ordre, après les fichiers qui définissent chaque fonction listée
-- (supabase-admin.sql, supabase-communities.sql, supabase-communities-2.sql,
-- supabase-events-v2.sql, supabase-create-community-event-authz-fix.sql,
-- supabase-info.sql, supabase-beta-access.sql, supabase-beta-feedback-
-- admin.sql, supabase-premium-messaging.sql, supabase-user-risk-level-authz-
-- fix.sql, supabase-geolocation.sql, supabase-likers-profile-overexposure-
-- fix.sql — tous déjà en prod ou en attente).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LE VRAI NOUVEAU TROU DE CETTE PASSE — check_beta_whitelist(event jsonb)
-- [supabase-beta-access.sql]. C'est une fonction d'Auth Hook Supabase
-- ("Before User Created"), censée n'être appelée QUE par le rôle interne
-- "supabase_auth_admin" lors d'une inscription — jamais par le client. Or
-- elle n'a JAMAIS eu de revoke/grant, donc PUBLIC (y compris "anon", sans
-- aucun compte) peut l'appeler directement via
-- supabase.rpc('check_beta_whitelist', { event: {...} }), ce qui expose
-- DEUX problèmes réels, cumulables sans jamais créer de compte :
--   - Oracle d'existence sur la liste blanche : la réponse (objet d'erreur
--     403 vs objet vide) révèle si un email précis est déjà invité en beta,
--     permettant d'énumérer/vérifier des adresses email de la table
--     beta_testers (jamais censée être lisible depuis le client — RLS sans
--     aucune policy sur cette table, précisément pour l'empêcher).
--   - Effet de bord réel sans jamais s'inscrire : l'appel fait aussi
--     "update beta_testers set used_at = now()" pour tout email déjà
--     invité — n'importe qui peut donc marquer à distance l'invitation de
--     quelqu'un d'autre comme "déjà utilisée" sans que cette personne ait
--     jamais créé de compte, corrompant le suivi de la liste blanche.
-- Correctif : restreindre l'exécution au seul rôle "supabase_auth_admin"
-- (convention officielle Supabase pour les Auth Hooks), en retirant
-- explicitement tout accès à "anon"/"authenticated"/public.
-- ----------------------------------------------------------------------------
revoke all on function check_beta_whitelist(jsonb) from public;
revoke all on function check_beta_whitelist(jsonb) from anon, authenticated;
grant execute on function check_beta_whitelist(jsonb) to supabase_auth_admin;

-- ----------------------------------------------------------------------------
-- 2. Fonction appelable "system-only" sans AUCUNE garde d'auth interne —
-- send_event_reminders() [supabase-events-v2.sql, section "Rappels
-- 24h/1h"]. Le fichier d'origine dit explicitement "fonction appelable, PAS
-- un trigger" et prévue pour tourner via pg_cron/le propriétaire de la
-- base — jamais un appel client. Sans revoke, PUBLIC (anon compris) peut la
-- déclencher à volonté via supabase.rpc('send_event_reminders'), ce qui
-- exécute des INSERT/UPDATE réels sur les notifications et jeux
-- d'inscription (event_attendees) d'autres utilisateurs sans aucune
-- vérification d'identité de l'appelant. Impact pratique limité par le
-- garde-fou reminder_24h_sent_at/reminder_1h_sent_at (idempotent, ne double
-- jamais un envoi), mais reste un appel non authentifié à une fonction à
-- effet de bord qui ne devrait être déclenchable que par une tâche
-- planifiée/le propriétaire — même défaut de conception que join_event()
-- avant son correctif. Aucun grant ajouté : ni "anon" ni "authenticated"
-- n'ont de raison légitime de l'appeler ; seul le propriétaire de la
-- fonction (rôle d'exécution de pg_cron, non soumis aux grants) doit
-- pouvoir la déclencher.
-- ----------------------------------------------------------------------------
revoke all on function send_event_reminders() from public;
revoke all on function send_event_reminders() from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. "grant" ajouté sans jamais avoir fait le "revoke" correspondant — le
-- droit hérité de PUBLIC (donc "anon", visiteur SANS compte) n'a jamais été
-- retiré, malgré l'intention affichée dans les fichiers d'origine. Impact
-- réel limité (les deux fonctions renvoient un résultat vide/null pour un
-- appelant non connecté, current_profile_id()/auth.uid() étant alors NULL
-- et vérifié en premier dans chaque corps de fonction — pas de fuite de
-- données ni d'effet de bord confirmé pour "anon"), mais c'est exactement
-- la même case "convention non appliquée" que le reste de cette passe :
--   - get_my_likers() / get_liker_profile_reveal(uuid)
--     [supabase-likers-profile-overexposure-fix.sql /
--      supabase-premium-admirers-reveal-fix.sql /
--      supabase-schema-cache-404-400-fix.sql — 3 fichiers ont réécrit ces
--      fonctions et ajouté le grant, aucun n'a ajouté le revoke]
--   - nearby_profiles(text, numeric)
--     [supabase-geolocation.sql / supabase-geolocation-privacy-fix.sql —
--      même oubli]
-- ----------------------------------------------------------------------------
revoke all on function get_my_likers() from public;
grant execute on function get_my_likers() to authenticated;

revoke all on function get_liker_profile_reveal(uuid) from public;
grant execute on function get_liker_profile_reveal(uuid) to authenticated;

revoke all on function public.nearby_profiles(text, numeric) from public;
grant execute on function public.nearby_profiles(text, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Fonctions à EFFET DE BORD (INSERT/UPDATE/DELETE) déjà protégées par une
-- garde interne explicite (raise exception si non authentifié / non
-- autorisé) — donc non exploitables aujourd'hui même sans revoke/grant,
-- contrairement à join_event()/accept_join_request()/reject_join_request()
-- avant leur correctif (qui laissaient l'INSERT/UPDATE s'exécuter avant ou
-- sans jamais vérifier l'identité de l'appelant). Ajout du revoke/grant ici
-- par pure défense en profondeur et cohérence avec le reste du projet
-- (decline_invite()/unmatch_profile() ont déjà ce traitement pour la même
-- famille de fonctions) — AUCUN changement de comportement attendu pour un
-- appelant légitime déjà authentifié.
--
-- accept_invite(uuid) [supabase-communities.sql] : filtre déjà
-- "invited_profile_id = current_profile_id()" dans la clause WHERE de
-- lecture -> un appelant anonyme ou tiers tombe sur "introuvable", jamais
-- d'accès à l'invitation d'autrui (contrairement au bug corrigé sur
-- accept_join_request(), où la vérification de droit arrivait dans un IF
-- séparé APRÈS confirmation d'existence, créant l'oracle).
-- ----------------------------------------------------------------------------
revoke all on function accept_invite(uuid) from public;
grant execute on function accept_invite(uuid) to authenticated;

-- accept_event_invitation(uuid) / decline_event_invitation(uuid)
-- [supabase-events-v2.sql] : même motif qu'accept_invite() ci-dessus
-- (filtre invited_profile_id = current_profile_id() dans le SELECT/UPDATE).
revoke all on function accept_event_invitation(uuid) from public;
grant execute on function accept_event_invitation(uuid) to authenticated;

revoke all on function decline_event_invitation(uuid) from public;
grant execute on function decline_event_invitation(uuid) to authenticated;

-- create_community(...) / create_event(...)
-- [supabase-create-community-event-authz-fix.sql, versions les plus
-- récentes] : commencent explicitement par
-- "if current_profile_id() is null then raise exception 'Non authentifie'".
revoke all on function create_community(text, text, text, text, text, text, text) from public;
grant execute on function create_community(text, text, text, text, text, text, text) to authenticated;

revoke all on function create_event(text, text, text, text, timestamptz, integer, text, text, integer, text, uuid, text) from public;
grant execute on function create_event(text, text, text, text, timestamptz, integer, text, text, integer, text, uuid, text) to authenticated;

-- Rôles/modération plateforme [supabase-admin.sql] : chacune commence par
-- "if not is_moderator_or_above()/is_admin_or_above() then raise exception"
-- (ou une vérification de rang équivalente). Note d'honnêteté : cette garde
-- dépend elle-même du correctif NULL-bypass
-- (supabase-authz-null-bypass-CRITIQUE-fix.sql, "coalesce(..., false)") pour
-- être fiable côté "authenticated" sans rôle — s'il n'est pas encore
-- appliqué en prod, ces fonctions restent vulnérables à un contournement
-- PAR UN COMPTE AUTHENTIFIÉ (pas par "anon", que ce fichier bloque bien).
-- Le revoke/grant ci-dessous ferme au moins la voie "anon" dans tous les cas.
revoke all on function grant_platform_role(uuid, text) from public;
grant execute on function grant_platform_role(uuid, text) to authenticated;

revoke all on function revoke_platform_role(uuid) from public;
grant execute on function revoke_platform_role(uuid) to authenticated;

revoke all on function suspend_user(uuid, timestamptz, text) from public;
grant execute on function suspend_user(uuid, timestamptz, text) to authenticated;

revoke all on function unsuspend_user(uuid) from public;
grant execute on function unsuspend_user(uuid) to authenticated;

revoke all on function ban_user(uuid, text) from public;
grant execute on function ban_user(uuid, text) to authenticated;

revoke all on function unban_user(uuid) from public;
grant execute on function unban_user(uuid) to authenticated;

revoke all on function admin_resolve_report(text, uuid, boolean) from public;
grant execute on function admin_resolve_report(text, uuid, boolean) to authenticated;

revoke all on function admin_set_monetization(boolean) from public;
grant execute on function admin_set_monetization(boolean) to authenticated;

revoke all on function admin_update_feedback(uuid, text, text, text) from public;
grant execute on function admin_update_feedback(uuid, text, text, text) to authenticated;

-- Cycle éditorial Baobab Info [supabase-info.sql] : chacune commence par
-- "if not is_info_editor()/is_info_admin() then raise exception".
revoke all on function create_info_article(text, text, text, text, text, text, text, boolean, boolean, text, text, text, text, timestamptz) from public;
grant execute on function create_info_article(text, text, text, text, text, text, text, boolean, boolean, text, text, text, text, timestamptz) to authenticated;

revoke all on function update_info_article(uuid, text, text, text, text, text, text, text, text, text, text, timestamptz) from public;
grant execute on function update_info_article(uuid, text, text, text, text, text, text, text, text, text, text, timestamptz) to authenticated;

revoke all on function submit_info_article_for_review(uuid) from public;
grant execute on function submit_info_article_for_review(uuid) to authenticated;

revoke all on function approve_info_article(uuid) from public;
grant execute on function approve_info_article(uuid) to authenticated;

revoke all on function publish_info_article(uuid) from public;
grant execute on function publish_info_article(uuid) to authenticated;

revoke all on function archive_info_article(uuid) from public;
grant execute on function archive_info_article(uuid) to authenticated;

revoke all on function revert_info_article_to_draft(uuid) from public;
grant execute on function revert_info_article_to_draft(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Fonctions EN LECTURE SEULE (aucun INSERT/UPDATE/DELETE dans leur corps)
-- déjà protégées par une garde interne (is_moderator_or_above() ou
-- vérification équivalente basée sur current_profile_id()) — donc sans
-- fuite de données confirmée aujourd'hui, mais listées ici pour la même
-- raison de cohérence/défense en profondeur que la section 4 (même remarque
-- sur la dépendance au correctif NULL-bypass pour un appelant "authenticated"
-- sans rôle).
-- ----------------------------------------------------------------------------
revoke all on function admin_dashboard_stats() from public;
grant execute on function admin_dashboard_stats() to authenticated;

revoke all on function admin_search_users(text) from public;
grant execute on function admin_search_users(text) to authenticated;

revoke all on function admin_list_reports(text) from public;
grant execute on function admin_list_reports(text) to authenticated;

revoke all on function admin_list_feedback(text) from public;
grant execute on function admin_list_feedback(text) to authenticated;

revoke all on function user_risk_level(uuid) from public;
grant execute on function user_risk_level(uuid) to authenticated;

revoke all on function get_message_quota(text) from public;
grant execute on function get_message_quota(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges
--   where routine_name in (
--     'check_beta_whitelist','send_event_reminders','get_my_likers',
--     'get_liker_profile_reveal','nearby_profiles','accept_invite',
--     'accept_event_invitation','decline_event_invitation','create_community',
--     'create_event','grant_platform_role','revoke_platform_role',
--     'suspend_user','unsuspend_user','ban_user','unban_user',
--     'admin_resolve_report','admin_set_monetization','admin_update_feedback',
--     'create_info_article','update_info_article',
--     'submit_info_article_for_review','approve_info_article',
--     'publish_info_article','archive_info_article',
--     'revert_info_article_to_draft','admin_dashboard_stats',
--     'admin_search_users','admin_list_reports','admin_list_feedback',
--     'user_risk_level','get_message_quota'
--   )
--   order by routine_name, grantee;
-- -- Confirmer qu'aucune ligne ne reste avec grantee = 'PUBLIC' (sauf
-- -- check_beta_whitelist, dont le seul grantee attendu est
-- -- 'supabase_auth_admin' et surtout pas 'public'/'anon'/'authenticated').
-- ============================================================================
