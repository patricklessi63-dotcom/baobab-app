-- ============================================================================
-- STATUTS DE SIGNALEMENT : en attente / en cours d'examen / confirmé / rejeté / résolu
-- (cahier des charges de modération, section 7)  —  LIVRÉ, NON EXÉCUTÉ EN PRODUCTION.
--
-- Aujourd'hui un signalement est « open » puis « resolved » ou « dismissed ». ATTENTION (trouvé à l'essai sur la répétition) :
-- community_reports, event_reports, post_reports et info_reports ont une contrainte CHECK
-- (status = any (array['open','resolved','dismissed'])) en production ; seule `reports` (profil) n'en a pas. Ce fichier ÉLARGIT
-- ces quatre contraintes (étape 0, additive : les lignes existantes restent valides) AVANT les fonctions.
--
--   open       = en attente
--   in_review  = en cours d'examen (un modérateur a pris le signalement en charge)
--   confirmed  = confirmé (l'infraction est établie ; reste à agir puis à clore)
--   dismissed  = rejeté (déjà le cas : bouton « Ignorer »)
--   resolved   = résolu (déjà le cas)
--
-- Ce fichier (aucune donnée modifiée, droits d'exécution conservés) :
--  0. Élargit les contraintes CHECK de status des 4 tables (open, in_review, confirmed, resolved, dismissed) ; retrouve la contrainte
--     par sa définition (pas par son nom), la remplace par <table>_status_check. Rejouable.
--  1. admin_list_reports(p_status) : 'open' = À TRAITER (open + in_review + confirmed), 'all' = tout, sinon le statut exact.
--     Même forme de retour qu'avant (le client existant continue de marcher). Id d'un signalement de PROFIL en uuid réversible
--     (reports.id est un entier en production : voir supabase-admin-list-reports-hotfix.sql).
--  2. admin_resolve_report : accepte comme point de départ open, in_review ou confirmed (avant : open seulement).
--  3. admin_set_report_status(source, id, statut, note) : open | in_review | confirmed, avec verrou et transitions contrôlées.
--     Journalisé dans moderation_decisions (SQL-31) SI cette table existe ; sinon sans journal (pas de dépendance dure :
--     admin_actions a une contrainte CHECK sur action_type qu'on ne touche pas ici).
--
-- Prérequis : supabase-admin-list-reports-hotfix.sql déjà exécuté (5 novembre 2026). Rejouable.
-- Retour arrière : (1) remettre à open les signalements in_review / confirmed (update <table> set status = 'open' where status in
-- ('in_review','confirmed')) ; (2) rejouer le hotfix (restaure admin_list_reports et admin_resolve_report) ; (3) remettre l'ancienne
-- contrainte : alter table <table> drop constraint <table>_status_check; alter table <table> add constraint <table>_status_check
-- check (status = any (array['open','resolved','dismissed'])).
-- ============================================================================

-- 0. Contraintes CHECK de status des 4 tables de signalement (community, event, post, info) : élargies. On retrouve la contrainte par
-- sa définition (elle parle de status et de 'open'), quel que soit son nom, puis on la remplace. Les lignes existantes restent
-- valides (la nouvelle liste est un sur-ensemble). 'reports' (profil) n'a pas de contrainte : on n'en ajoute pas.
do $$
declare
  t text;
  c record;
begin
  foreach t in array array['community_reports', 'event_reports', 'post_reports', 'info_reports'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for c in
      select conname from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%' and pg_get_constraintdef(oid) ilike '%open%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    execute format('alter table public.%I add constraint %I check (status = any (array[''open'', ''in_review'', ''confirmed'', ''resolved'', ''dismissed'']))', t, t || '_status_check');
  end loop;
end;
$$;

-- Aides internes (jamais appelables par un client).
create or replace function admin_report_table(p_source text)
returns text language sql immutable set search_path = public as $$
  select case p_source
    when 'community' then 'community_reports'
    when 'event' then 'event_reports'
    when 'post' then 'post_reports'
    when 'info' then 'info_reports'
    when 'profile' then 'reports'
    else null end
$$;

-- Décode l'uuid réversible d'un signalement de profil (16 zéros + 16 chiffres hexadécimaux = un entier) ; sinon l'uuid tel quel.
create or replace function admin_report_key(p_source text, p_id uuid)
returns text language sql immutable set search_path = public as $$
  select case
    when p_source = 'profile' and replace(p_id::text, '-', '') ~ '^0{16}[0-9a-f]{16}$'
      then (('x' || right(replace(p_id::text, '-', ''), 16))::bit(64)::bigint)::text
    else p_id::text end
$$;

create or replace function admin_list_reports(p_status text default 'open')
returns table (
  source text, id uuid, target_type text, target_id text, from_id uuid,
  category text, reason text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select r.source, r.id, r.target_type, r.target_id, r.from_id, r.category, r.reason, r.status, r.created_at
    from (
      select 'community'::text as source, cr.id, cr.target_type, cr.target_id::text, cr.from_id, cr.category, cr.reason, coalesce(cr.status, 'open') as status, cr.created_at
      from community_reports cr
      union all
      select 'event'::text, er.id, 'event'::text, er.event_id::text, er.from_id, er.category, er.reason, coalesce(er.status, 'open'), er.created_at
      from event_reports er
      union all
      select 'post'::text, pr.id, pr.target_type, pr.target_id::text, pr.from_id, pr.category, pr.reason, coalesce(pr.status, 'open'), pr.created_at
      from post_reports pr
      union all
      select 'info'::text, ir.id, 'info_article'::text, ir.article_id::text, ir.from_id, ir.category, ir.reason, coalesce(ir.status, 'open'), ir.created_at
      from info_reports ir
      union all
      -- reports.id est bigint en production (uuid ailleurs) : entier encode en uuid reversible, uuid garde tel quel
      select 'profile'::text,
             case when rp.id::text ~ '^[0-9]+$' then lpad(to_hex(rp.id::text::bigint), 32, '0')::uuid else rp.id::text::uuid end,
             'profile'::text, rp.to_id::text, rp.from_id, rp.category, rp.reason, coalesce(rp.status, 'open'), rp.created_at
      from reports rp
    ) r
    where case coalesce(p_status, 'open')
            when 'open' then r.status in ('open', 'in_review', 'confirmed')
            when 'all' then true
            else r.status = p_status end
    order by
      case r.category when 'mineur_suspecte' then 0 when 'arnaque' then 1 when 'harcelement' then 2 else 3 end,
      r.created_at desc
    limit 200;
end;
$$;

-- Clôture : resolved (résolu) ou dismissed (rejeté). Point de départ : open, in_review ou confirmed.
create or replace function admin_resolve_report(p_source text, p_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_dismiss then 'dismissed' else 'resolved' end;
  v_table text := admin_report_table(p_source);
  v_key text;
  v_current text;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  if v_table is null then raise exception 'Source inconnue'; end if;
  v_key := admin_report_key(p_source, p_id);
  execute format('select coalesce(status, ''open'') from public.%I where id::text = $1 for update', v_table) into v_current using v_key;
  if v_current is null or v_current not in ('open', 'in_review', 'confirmed') then
    raise exception 'Signalement introuvable ou deja traite';
  end if;
  execute format('update public.%I set status = $1 where id::text = $2', v_table) using v_status, v_key;

  insert into admin_actions (actor_id, action_type, metadata)
  values (current_profile_id(), case when p_dismiss then 'report_dismissed' else 'report_resolved' end,
    jsonb_build_object('source', p_source, 'report_id', p_id));
end;
$$;

-- Étapes intermédiaires : open (relâcher), in_review (prendre en charge), confirmed (infraction établie).
create or replace function admin_set_report_status(p_source text, p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_table text := admin_report_table(p_source);
  v_key text;
  v_current text;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  if v_table is null then raise exception 'Source inconnue'; end if;
  if p_status not in ('open', 'in_review', 'confirmed') then raise exception 'Statut invalide'; end if;
  v_key := admin_report_key(p_source, p_id);
  execute format('select coalesce(status, ''open'') from public.%I where id::text = $1 for update', v_table) into v_current using v_key;
  if v_current is null or v_current not in ('open', 'in_review', 'confirmed') then
    raise exception 'Signalement introuvable ou deja traite';
  end if;
  -- une infraction confirmee ne revient pas en arriere : on la clot (resolu / rejete) avec admin_resolve_report
  if v_current = 'confirmed' and p_status <> 'confirmed' then raise exception 'Transition invalide'; end if;
  if v_current = p_status then return; end if;
  execute format('update public.%I set status = $1 where id::text = $2', v_table) using p_status, v_key;

  if to_regclass('public.moderation_decisions') is not null then
    execute 'insert into public.moderation_decisions (actor_id, action, target_ref, reason) values ($1, $2, $3, $4)'
      using current_profile_id(), 'report_' || p_status, p_source || ':' || p_id::text, left(p_note, 500);
  end if;
end;
$$;

-- Droits : les aides sont internes ; les trois RPC sont pour les comptes connectes (chacune verifie le role elle-meme).
revoke all on function admin_report_table(text), admin_report_key(text, uuid) from public, anon, authenticated;
revoke all on function admin_set_report_status(text, uuid, text, text) from public, anon;
grant execute on function admin_set_report_status(text, uuid, text, text) to authenticated;
revoke all on function admin_list_reports(text), admin_resolve_report(text, uuid, boolean) from public, anon;
grant execute on function admin_list_reports(text), admin_resolve_report(text, uuid, boolean) to authenticated;

-- Verification (lecture seule, a executer apres) :
-- select source, category, status from admin_list_reports('open') limit 5;
-- select status, count(*) from admin_list_reports('all') group by 1;
-- ============================================================================
