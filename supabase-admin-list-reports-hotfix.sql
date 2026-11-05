-- ============================================================================
-- CORRECTIF : l'onglet Signalements du tableau de bord administrateur renvoyait HTTP 400 a chaque appel (admin_list_reports).
--
-- DEUX causes, toutes deux corrigees ici :
--  1. reports.id est bigint en PRODUCTION (uuid pour community/event/post/info_reports) : le UNION ALL echoue a l'analyse avec
--       « UNION types uuid and bigint cannot be matched »   (vu dans les journaux Postgres a chaque 400).
--  2. l'ORDER BY « case category ... » non qualifie est ambigu avec la colonne de sortie (RETURNS TABLE ... category ...) :
--       « column reference "category" is ambiguous »     (42702, reproduit sur PostgreSQL embarque).
--
-- Solution sans changer les signatures (le client reste identique) : l'id d'un signalement de PROFIL est renvoye sous forme d'uuid reversible
-- (entier -> 32 chiffres hexadecimaux, ex. 00000000-0000-0000-0000-00000000002a pour l'id 42) et admin_resolve_report le decode.
-- Fonctionne aussi si reports.id est un uuid. admin_resolve_report gagne la branche 'profile' (absente de la version precedente :
-- « Source inconnue ») avec le meme verrou et le meme controle « deja traite » que les autres sources.
--
-- create or replace seulement : aucune donnee modifiee, droits d'execution conserves. A executer dans Supabase : SQL Editor. Rejouable.
-- Tests : src/native/adminListReports.test.js (PGlite avec reports.id bigint ET uuid).
-- ============================================================================
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
      select 'community'::text as source, cr.id, cr.target_type, cr.target_id::text, cr.from_id, cr.category, cr.reason, cr.status, cr.created_at
      from community_reports cr where cr.status = p_status
      union all
      select 'event'::text, er.id, 'event'::text, er.event_id::text, er.from_id, er.category, er.reason, er.status, er.created_at
      from event_reports er where er.status = p_status
      union all
      select 'post'::text, pr.id, pr.target_type, pr.target_id::text, pr.from_id, pr.category, pr.reason, coalesce(pr.status,'open'), pr.created_at
      from post_reports pr where coalesce(pr.status,'open') = p_status
      union all
      select 'info'::text, ir.id, 'info_article'::text, ir.article_id::text, ir.from_id, ir.category, ir.reason, ir.status, ir.created_at
      from info_reports ir where ir.status = p_status
      union all
      -- reports.id est bigint en production (uuid ailleurs) : encode un entier en uuid reversible, garde un uuid tel quel
      select 'profile'::text,
             case when rp.id::text ~ '^[0-9]+$' then lpad(to_hex(rp.id::text::bigint), 32, '0')::uuid else rp.id::text::uuid end,
             'profile'::text, rp.to_id::text, rp.from_id, rp.category, rp.reason, rp.status, rp.created_at
      from reports rp where rp.status = p_status
    ) r
    order by
      case r.category when 'mineur_suspecte' then 0 when 'arnaque' then 1 when 'harcelement' then 2 else 3 end,
      r.created_at desc
    limit 200;
end;
$$;

create or replace function admin_resolve_report(p_source text, p_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_dismiss then 'dismissed' else 'resolved' end;
  v_current_status text;
  v_hex text;
  v_key text;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;

  if p_source = 'community' then
    select status into v_current_status from community_reports where id = p_id for update;
    if v_current_status is distinct from 'open' then
      raise exception 'Signalement introuvable ou deja traite';
    end if;
    update community_reports set status = v_status where id = p_id;
  elsif p_source = 'event' then
    select status into v_current_status from event_reports where id = p_id for update;
    if v_current_status is distinct from 'open' then
      raise exception 'Signalement introuvable ou deja traite';
    end if;
    update event_reports set status = v_status where id = p_id;
  elsif p_source = 'post' then
    select coalesce(status, 'open') into v_current_status from post_reports where id = p_id for update;
    if v_current_status is distinct from 'open' then
      raise exception 'Signalement introuvable ou deja traite';
    end if;
    update post_reports set status = v_status where id = p_id;
  elsif p_source = 'info' then
    select status into v_current_status from info_reports where id = p_id for update;
    if v_current_status is distinct from 'open' then
      raise exception 'Signalement introuvable ou deja traite';
    end if;
    update info_reports set status = v_status where id = p_id;
  elsif p_source = 'profile' then
    -- decode l'uuid reversible produit par admin_list_reports (16 zeros + 16 chiffres hexadecimaux = un entier) ; sinon uuid tel quel
    v_hex := replace(p_id::text, '-', '');
    v_key := case when v_hex ~ '^0{16}[0-9a-f]{16}$' then (('x' || right(v_hex, 16))::bit(64)::bigint)::text else p_id::text end;
    select status into v_current_status from reports where id::text = v_key for update;
    if v_current_status is distinct from 'open' then
      raise exception 'Signalement introuvable ou deja traite';
    end if;
    update reports set status = v_status where id::text = v_key;
  else
    raise exception 'Source inconnue';
  end if;

  insert into admin_actions (actor_id, action_type, metadata)
  values (current_profile_id(), case when p_dismiss then 'report_dismissed' else 'report_resolved' end,
    jsonb_build_object('source', p_source, 'report_id', p_id));
end;
$$;

-- Verification (lecture seule, a executer apres) :
-- select source, id, category, status from admin_list_reports('open') limit 5;   -- ne doit plus lever d'erreur
-- select count(*) from admin_list_reports('open');                               -- <= 200
-- ============================================================================
