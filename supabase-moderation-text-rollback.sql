-- ============================================================================
-- Retour arrière de supabase-moderation-text.sql (SQL-27)
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

-- ---------- C. suppression complète (décommenter pour exécuter) ----------
-- drop function if exists moderation_screen(text, text);
-- drop function if exists report_media(text, uuid, text, text);
-- drop function if exists admin_moderation_violations(text, int);
-- drop function if exists admin_moderation_sanctions(boolean, int);
-- drop function if exists admin_media_queue(int);
-- drop function if exists moderation_resolve_flag(uuid, boolean, text);
-- drop function if exists moderation_revoke_sanction(uuid, text);
-- drop function if exists moderation_appeal(uuid, text);
-- drop function if exists moderation_decide_appeal(uuid, boolean, text);
-- drop function if exists moderate_media(text, uuid, text, text);
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
-- drop table if exists media_moderation, media_reports, moderation_decisions, moderation_sanctions,
--   moderation_violations, moderation_exceptions, moderation_terms, moderation_settings;
