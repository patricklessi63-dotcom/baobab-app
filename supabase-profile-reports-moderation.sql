-- ============================================================================
-- CORRECTIF SÉCURITÉ — trouvé lors de l'audit autonome complet du 22 août
-- 2026 (prompt-audit-autonome-complet-baobab.md, section Sécurité/
-- vérification/modération) : les signalements de PROFIL (table "reports",
-- from_id/to_id — utilisés depuis Découverte, le profil public et la
-- messagerie, donc le type de signalement le plus sensible : harcèlement,
-- arnaque, comportement inapproprié entre deux personnes réellement mises
-- en relation) n'étaient JAMAIS visibles par un modérateur.
--
-- admin_list_reports()/admin_resolve_report() (supabase-admin.sql) ne
-- couvraient que community_reports/event_reports/post_reports/info_reports
-- — "reports" (profils) en était absent, et la table n'avait même pas de
-- colonne "status" pour en suivre le traitement. Un signalement de profil
-- soumis par un utilisateur restait donc inséré en base sans jamais être vu
-- ni traité par personne.
--
-- À exécuter dans Supabase : SQL Editor (une fois), après supabase-admin.sql
-- et supabase-messaging.sql. Additif uniquement.
-- ============================================================================

alter table reports add column if not exists status text not null default 'open';

create or replace function admin_list_reports(p_status text default 'open')
returns table (
  source text, id uuid, target_type text, target_id text, from_id uuid,
  category text, reason text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select 'community'::text, cr.id, cr.target_type, cr.target_id::text, cr.from_id, cr.category, cr.reason, cr.status, cr.created_at
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
    select 'profile'::text, r.id, 'profile'::text, r.to_id::text, r.from_id, r.category, r.reason, r.status, r.created_at
    from reports r where r.status = p_status
    order by created_at desc;
end;
$$;

create or replace function admin_resolve_report(p_source text, p_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text := case when p_dismiss then 'dismissed' else 'resolved' end;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  if p_source = 'community' then
    update community_reports set status = v_status where id = p_id;
  elsif p_source = 'event' then
    update event_reports set status = v_status where id = p_id;
  elsif p_source = 'post' then
    update post_reports set status = v_status where id = p_id;
  elsif p_source = 'info' then
    update info_reports set status = v_status where id = p_id;
  elsif p_source = 'profile' then
    update reports set status = v_status where id = p_id;
  else
    raise exception 'Source inconnue';
  end if;

  insert into admin_actions (actor_id, action_type, metadata)
  values (current_profile_id(), case when p_dismiss then 'report_dismissed' else 'report_resolved' end,
    jsonb_build_object('source', p_source, 'report_id', p_id));
end;
$$;

create or replace function admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  select jsonb_build_object(
    'total_users', (select count(*) from profiles),
    'suspended_users', (select count(*) from profiles where suspended_until is not null and suspended_until > now()),
    'banned_users', (select count(*) from profiles where banned_at is not null),
    'open_reports', (
      (select count(*) from community_reports where status = 'open') +
      (select count(*) from event_reports where status = 'open') +
      (select count(*) from post_reports where coalesce(status,'open') = 'open') +
      (select count(*) from info_reports where status = 'open') +
      (select count(*) from reports where status = 'open')
    ),
    'pending_info_review', (select count(*) from info_articles where status = 'pending_review')
  ) into v_result;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select admin_dashboard_stats();
-- select * from admin_list_reports('open');
-- ============================================================================
