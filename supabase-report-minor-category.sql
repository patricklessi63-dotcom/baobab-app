-- ============================================================================
-- Audit sécurité (prompt-securite-verification-moderation-baobab.md) —
-- ajoute la catégorie de signalement "Mineur suspecté" (absente jusqu'ici,
-- fondue à tort dans "Faux profil") et sa priorité de traitement la plus
-- haute dans la file de modération. À exécuter dans Supabase : SQL Editor,
-- après supabase-messaging.sql (contrainte existante) et supabase-admin.sql
-- (fonction admin_list_reports existante).
-- ============================================================================

alter table reports drop constraint if exists reports_category_check;
alter table reports add constraint reports_category_check check (
  category is null or category in ('harcelement','spam','faux_profil','contenu_inapproprie','arnaque','mineur_suspecte','autre')
);

-- Priorité de traitement : un signalement "mineur suspecté" ou "arnaque"
-- passe avant un signalement de contenu simplement inapproprié, quel que
-- soit son horodatage — redéfinition complète (CREATE OR REPLACE) pour ne
-- pas perdre la logique existante (voir supabase-admin.sql, section 8).
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
      select 'profile'::text, rp.id, 'profile'::text, rp.to_id::text, rp.from_id, rp.category, rp.reason, rp.status, rp.created_at
      from reports rp where rp.status = p_status
    ) r
    order by
      case r.category when 'mineur_suspecte' then 0 when 'arnaque' then 1 when 'harcelement' then 2 else 3 end,
      r.created_at desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif) :
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'reports_category_check';
-- select * from admin_list_reports('open') order by category limit 5;
-- ============================================================================
