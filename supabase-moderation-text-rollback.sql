-- ============================================================================
-- Retour arrière de supabase-moderation-text.sql (SQL-31)
--
-- A. COUPURE DOUCE (recommandée, sans perte) : arrête tous les refus et toutes les sanctions
--    automatiques en une ligne, en gardant les tables et l'historique :
--      update moderation_settings set text_filter_enabled = false where id = 1;
--    Les déclencheurs deviennent des no-op, moderation_screen() répond « allowed ».
--
-- B. RETRAIT DES DÉCLENCHEURS seulement (le filet serveur disparaît, le reste est conservé) :
--    la section « B » ci-dessous.
--
-- C. SUPPRESSION COMPLÈTE : la section « C » EFFACE les infractions, sanctions, signalements
--    d'images et le journal des décisions. À ne lancer qu'après export (select * ... -> CSV).
--    Les comptes déjà suspendus ou bannis par cette fonction le RESTENT : annuler d'abord
--    leurs sanctions (moderation_revoke_sanction) ou utiliser unsuspend_user / unban_user.
-- ============================================================================

-- ---------- B. déclencheurs ----------
drop trigger if exists trg_moderation_messages on messages;
drop trigger if exists trg_moderation_posts on posts;
drop trigger if exists trg_moderation_post_comments on post_comments;
drop trigger if exists trg_moderation_community_posts on community_posts;
drop trigger if exists trg_moderation_community_comments on community_comments;
drop trigger if exists trg_moderation_event_comments on event_comments;
drop trigger if exists trg_moderation_stories on stories;
drop trigger if exists trg_moderation_profiles_bio on profiles;
-- Bannissement (révocation des sessions, registre d'e-mails) et journal non modifiable :
drop trigger if exists trg_modban_change on profiles;
drop trigger if exists trg_modban_signup on auth.users; -- a lancer avec le role proprietaire de auth.users
drop trigger if exists trg_modban_email on auth.users;
drop trigger if exists trg_modlog_immutable on moderation_decisions;

-- ---------- C. suppression complète (décommenter pour exécuter) ----------
-- drop function if exists moderation_screen(text, text);
-- drop function if exists report_media(text, text, text, text);
-- drop function if exists admin_moderation_violations(text, int);
-- drop function if exists admin_moderation_sanctions(boolean, int);
-- drop function if exists admin_media_queue(int);
-- drop function if exists admin_media_info(text, text);
-- drop function if exists moderation_resolve_flag(uuid, boolean, text);
-- drop function if exists moderation_revoke_sanction(uuid, text);
-- drop function if exists moderation_appeal(uuid, text);
-- drop function if exists moderation_decide_appeal(uuid, boolean, text);
-- drop function if exists moderate_media(text, text, text, text);
-- drop function if exists moderation_purge_old(int);
-- drop function if exists admin_upsert_moderation_term(text, text, text, boolean);
-- drop function if exists admin_delete_moderation_term(bigint);
-- drop function if exists admin_upsert_moderation_exception(text, boolean);
-- drop function if exists admin_update_moderation_settings(jsonb);
-- drop function if exists moderation_apply_ladder(uuid, uuid);
-- drop function if exists moderation_record_flag(uuid, text, text, text, text, text);
-- drop function if exists moderation_guard_text();
-- drop function if exists moderation_require_moderator();
-- drop function if exists moderation_check(text);
-- drop function if exists moderation_normalize(text);
-- drop function if exists moderation_normalize_term(text);
-- drop function if exists moderation_terms_set_norm();
-- drop function if exists moderation_on_ban_change();
-- drop function if exists moderation_block_banned_signup();
-- drop function if exists moderation_email_key(text);
-- drop function if exists moderation_decisions_immutable();
-- drop function if exists moderation_suggest_rule(text, text, text, text, text);
-- drop function if exists admin_decide_rule_suggestion(uuid, boolean, text);
-- drop function if exists admin_moderation_suggestions(text, int);
-- drop function if exists admin_moderation_term_stats(int);
-- drop function if exists admin_test_moderation(text, text);
-- drop function if exists my_moderation_status();
-- drop table if exists moderation_rule_suggestions, banned_identities, moderation_private;
-- drop table if exists media_moderation, media_reports, moderation_decisions, moderation_sanctions,
--   moderation_violations, moderation_exceptions, moderation_terms, moderation_settings;
