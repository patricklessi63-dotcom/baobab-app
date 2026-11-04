-- ============================================================================
-- SQL-30 — Limite de débit des COMMENTAIRES (publications, communautés, événements).
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Constaté le 4 novembre 2026 sur la répétition : un compte ordinaire a posté 60 commentaires de suite
-- sans le moindre refus. Les publications (50 / 24 h), statuts, communautés, événements et signalements
-- ont une limite côté serveur (supabase-content-creation-limits-fix.sql, supabase-report-rate-limit-fix.sql) ;
-- les commentaires, non : spam / harcèlement par rafale et croissance illimitée de la table.
--
-- CORRECTIF (additif, même motif que check_post_creation_rate_limit) : un déclencheur BEFORE INSERT par
-- table de commentaires, par AUTEUR :
--     - 20 commentaires par tranche de 5 minutes,
--     - 300 commentaires par 24 heures.
-- Usage normal : très en dessous. Aucune policy, contrainte ni donnée existante n'est touchée.
--
-- CONTRÔLES : select tgname from pg_trigger where tgname like 'trg_%_comment_rate_limit';
-- RETOUR ARRIÈRE :
--   drop trigger if exists trg_post_comment_rate_limit on public.post_comments;
--   drop trigger if exists trg_community_comment_rate_limit on public.community_comments;
--   drop trigger if exists trg_event_comment_rate_limit on public.event_comments;
--   drop function if exists public.check_comment_rate_limit();
-- Validé sur schéma factice PGlite (src/native/commentRateLimit.test.js) et sur la répétition.
-- ============================================================================

-- Une seule fonction pour les trois tables : le nom de la table arrive en argument du déclencheur.
create or replace function public.check_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := tg_argv[0];
  v_recent int;
  v_day int;
begin
  if v_table not in ('post_comments', 'community_comments', 'event_comments') then
    raise exception 'check_comment_rate_limit : table inattendue %', v_table;
  end if;
  execute format(
    'select count(*) filter (where created_at > now() - interval ''5 minutes''), count(*) from public.%I where author_id = $1 and created_at > now() - interval ''24 hours''',
    v_table
  ) into v_recent, v_day using new.author_id;
  if v_recent >= 20 or v_day >= 300 then
    raise exception 'Trop de commentaires crees recemment, reessaie plus tard';
  end if;
  return new;
end;
$$;

revoke all on function public.check_comment_rate_limit() from public;
revoke all on function public.check_comment_rate_limit() from anon;
revoke all on function public.check_comment_rate_limit() from authenticated;

drop trigger if exists trg_post_comment_rate_limit on public.post_comments;
create trigger trg_post_comment_rate_limit before insert on public.post_comments
for each row execute function public.check_comment_rate_limit('post_comments');

drop trigger if exists trg_community_comment_rate_limit on public.community_comments;
create trigger trg_community_comment_rate_limit before insert on public.community_comments
for each row execute function public.check_comment_rate_limit('community_comments');

drop trigger if exists trg_event_comment_rate_limit on public.event_comments;
create trigger trg_event_comment_rate_limit before insert on public.event_comments
for each row execute function public.check_comment_rate_limit('event_comments');
