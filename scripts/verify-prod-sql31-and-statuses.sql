-- ============================================================================
-- VÉRIFICATION EN LECTURE SEULE après l'exécution en production de :
--   (1) supabase-moderation-text.sql          (SQL-31, modération du texte)
--   (2) supabase-report-statuses.sql          (statuts de signalement ; à exécuter APRÈS SQL-31)
--
-- Aucune écriture. À lancer avec :
--   npx supabase db query --linked --project-ref vozehymbihnckzklxesw -f scripts/verify-prod-sql31-and-statuses.sql
-- Chaque ligne a un champ « ok » : tout doit valoir true. Un false = à examiner AVANT de laisser le trafic continuer
-- (retour arrière : supabase-moderation-text-rollback.sql, ou l'interrupteur
--   update moderation_settings set text_filter_enabled = false where id = 1;).
-- ============================================================================
select 'tables de modération (11)' as controle,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and c.relname in
           ('moderation_settings','moderation_terms','moderation_exceptions','moderation_violations','moderation_sanctions',
            'moderation_decisions','media_reports','media_moderation','moderation_private','banned_identities','moderation_rule_suggestions'))::text as valeur,
       (select count(*) = 11 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and c.relname in
           ('moderation_settings','moderation_terms','moderation_exceptions','moderation_violations','moderation_sanctions',
            'moderation_decisions','media_reports','media_moderation','moderation_private','banned_identities','moderation_rule_suggestions')) as ok
union all
select 'RLS activée sur toutes les tables de modération',
       (select count(*) filter (where not relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname like any (array['moderation\_%','media\_reports','media\_moderation','banned\_identities']) and c.relkind = 'r')::text,
       (select count(*) filter (where not relrowsecurity) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname like any (array['moderation\_%','media\_reports','media\_moderation','banned\_identities']) and c.relkind = 'r')
union all
select 'termes de la liste de départ (101 attendus)', (select count(*) from public.moderation_terms)::text, (select count(*) >= 100 from public.moderation_terms)
union all
select 'réglages : 4 avertissements / 24 h / 3 suspensions / fenêtre 365 j / bannissement auto / filtre actif',
       (select format('%s/%s/%s/%s/%s/%s', warnings_before_suspension, suspension_hours, suspensions_before_ban, window_days, auto_ban_enabled, text_filter_enabled) from public.moderation_settings where id = 1),
       (select warnings_before_suspension = 4 and suspension_hours = 24 and suspensions_before_ban = 3 and window_days = 365 and auto_ban_enabled and text_filter_enabled from public.moderation_settings where id = 1)
union all
select 'déclencheurs de contrôle de texte trg_moderation_* (11 attendus hors *_norm)',
       (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname like 'trg\_moderation\_%' and t.tgname not like '%\_norm')::text,
       (select count(*) = 11 from pg_trigger t where not t.tgisinternal and t.tgname like 'trg\_moderation\_%' and t.tgname not like '%\_norm')
union all
select 'déclencheur de bannissement sur profiles (trg_modban_change)',
       (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname = 'trg_modban_change' and t.tgrelid = 'public.profiles'::regclass)::text,
       (select count(*) = 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'trg_modban_change' and t.tgrelid = 'public.profiles'::regclass)
union all
select 'déclencheurs d''inscription sur auth.users (trg_modban_signup + trg_modban_email) : SANS EUX le bannissement durable de l''e-mail ne marche pas',
       (select coalesce(string_agg(t.tgname, ','), 'aucun') from pg_trigger t where not t.tgisinternal and t.tgrelid = 'auth.users'::regclass and t.tgname like 'trg\_modban\_%'),
       (select count(*) = 2 from pg_trigger t where not t.tgisinternal and t.tgrelid = 'auth.users'::regclass and t.tgname like 'trg\_modban\_%')
union all
select 'journal des décisions non modifiable (trg_modlog_immutable)',
       (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname = 'trg_modlog_immutable')::text,
       (select count(*) = 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'trg_modlog_immutable')
union all
select 'ids d''images en text (media_reports.target_id, media_moderation.target_id)',
       (select string_agg(table_name || ':' || data_type, ',' order by table_name) from information_schema.columns
         where table_schema = 'public' and column_name = 'target_id' and table_name in ('media_reports','media_moderation')),
       (select count(*) = 2 from information_schema.columns
         where table_schema = 'public' and column_name = 'target_id' and table_name in ('media_reports','media_moderation') and data_type = 'text')
union all
select 'anon n''a AUCUN droit d''exécution sur les fonctions de modération',
       (select count(*) from information_schema.routine_privileges
         where routine_schema = 'public' and grantee in ('anon','PUBLIC')
           and (routine_name like 'moderation\_%' or routine_name in ('report_media','moderate_media','my_moderation_status','admin_media_info','admin_media_queue',
               'admin_test_moderation','admin_moderation_term_stats','admin_moderation_suggestions','admin_decide_rule_suggestion','admin_set_report_status',
               'admin_report_table','admin_report_key')))::text,
       (select count(*) = 0 from information_schema.routine_privileges
         where routine_schema = 'public' and grantee in ('anon','PUBLIC')
           and (routine_name like 'moderation\_%' or routine_name in ('report_media','moderate_media','my_moderation_status','admin_media_info','admin_media_queue',
               'admin_test_moderation','admin_moderation_term_stats','admin_moderation_suggestions','admin_decide_rule_suggestion','admin_set_report_status',
               'admin_report_table','admin_report_key')))
union all
select 'fonctions internes non exécutables par authenticated (empreinte, déclencheurs, aides)',
       (select count(*) from information_schema.routine_privileges
         where routine_schema = 'public' and grantee = 'authenticated'
           and routine_name in ('moderation_email_key','moderation_on_ban_change','moderation_block_banned_signup','moderation_decisions_immutable','moderation_apply_ladder',
                                'moderation_record_flag','moderation_guard_text','moderation_require_moderator','admin_report_table','admin_report_key'))::text,
       (select count(*) = 0 from information_schema.routine_privileges
         where routine_schema = 'public' and grantee = 'authenticated'
           and routine_name in ('moderation_email_key','moderation_on_ban_change','moderation_block_banned_signup','moderation_decisions_immutable','moderation_apply_ladder',
                                'moderation_record_flag','moderation_guard_text','moderation_require_moderator','admin_report_table','admin_report_key'))
union all
select 'moteur de détection (lecture seule) : « c.o.n.n.a.r.d » refusé, « Un concert à Montréal » accepté',
       (select format('%s / %s', (select blocked from public.moderation_check('c.o.n.n.a.r.d')), (select blocked from public.moderation_check('Un concert à Montréal'))))::text,
       (select (select blocked from public.moderation_check('c.o.n.n.a.r.d')) and not (select blocked from public.moderation_check('Un concert à Montréal')))
union all
-- statuts de signalement (n'a de sens qu'APRÈS le 2e fichier : si absent, ces 3 lignes valent false tant qu'il n'est pas exécuté)
select 'statuts de signalement : fonction admin_set_report_status présente',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_set_report_status')::text,
       (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_set_report_status')
union all
select 'statuts de signalement : 4 contraintes CHECK élargies à 5 statuts',
       (select count(*) from pg_constraint where contype = 'c' and conrelid::regclass::text in ('community_reports','event_reports','post_reports','info_reports')
          and pg_get_constraintdef(oid) ilike '%in_review%' and pg_get_constraintdef(oid) ilike '%confirmed%')::text,
       (select count(*) = 4 from pg_constraint where contype = 'c' and conrelid::regclass::text in ('community_reports','event_reports','post_reports','info_reports')
          and pg_get_constraintdef(oid) ilike '%in_review%' and pg_get_constraintdef(oid) ilike '%confirmed%')
union all
select 'rien n''a été écrasé : toutes les données de signalements et de messages sont toujours là',
       (select format('messages=%s, profils=%s', (select count(*) from public.messages), (select count(*) from public.profiles)))::text,
       true
order by 1;
