-- ============================================================================
-- Plafonne les résultats de admin_list_reports() et admin_list_feedback(),
-- les deux seules RPC admin (avec admin_search_users, déjà plafonnée à 100
-- lignes) à renvoyer une liste complète sans aucune limite. Le tableau de
-- bord (AdminDashboard.jsx) n'a ni pagination ni "charger plus" : il rend
-- purement et simplement tout ce que la RPC retourne. Tant que les
-- signalements/retours restent peu nombreux ça ne se voit pas, mais rien
-- n'empêchait ces deux requêtes de charger des milliers de lignes d'un coup
-- (tous les signalements "ouverts" jamais traités, tout l'historique de
-- retours bêta) le jour où l'app grossit — page qui se fige, mémoire
-- navigateur qui explose. À exécuter dans Supabase : SQL Editor. Additif
-- uniquement (create or replace), ne change aucune donnée.
--
-- CORRIGÉ avant exécution (audit du 3 septembre 2026, croisement des
-- migrations SQL les plus récentes) : la première version de ce fichier
-- repartait de la définition de base d'admin_list_reports() (celle de
-- supabase-admin.sql, "order by created_at desc" simple) pour y ajouter
-- "limit 200" — exactement le même type d'oubli que celui déjà corrigé
-- pour admin_dashboard_stats() dans supabase-admin-dashboard-stats-fix.sql
-- (migration non fusionnée avec une évolution plus récente de la même
-- fonction). Ce faisant, elle effaçait silencieusement le tri par priorité
-- ajouté par supabase-report-minor-category.sql (mineur_suspecte, puis
-- arnaque, puis harcelement, TOUJOURS avant les autres catégories, quel
-- que soit l'horodatage — voir ReportModal.jsx et le commentaire de ce
-- fichier). adminApi.js (listReports) et AdminDashboard.jsx affichent les
-- signalements exactement dans l'ordre renvoyé par la RPC, sans aucun tri
-- côté client : sans ce correctif, un signalement "mineur suspecté" se
-- serait retrouvé noyé dans la liste par simple ordre chronologique, alors
-- que c'est justement la catégorie qui doit remonter en tête de file de
-- modération. La version ci-dessous restaure ce tri par priorité et
-- ajoute la limite par-dessus.
-- ============================================================================

-- 2e CORRECTION (5 novembre 2026) : la version précédente de ce fichier, exécutée en production, faisait échouer admin_list_reports()
-- à chaque appel (HTTP 400, « column reference "category" is ambiguous ») : RETURNS TABLE expose une colonne « category » que
-- l'ORDER BY non qualifié confondait avec la colonne de sortie. L'ORDER BY est maintenant appliqué sur une sous-requête avec des
-- colonnes qualifiées (r.category, r.created_at). Voir aussi supabase-admin-list-reports-hotfix.sql (à exécuter seul).
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
      r.created_at desc
    limit 200;
end;
$$;

create or replace function admin_list_feedback(p_status text default null)
returns table (
  id uuid, profile_id uuid, author_name text, message text, category text,
  categories text[], priority text, status text, screen text, device text,
  browser text, app_version text, admin_notes text, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select bf.id, bf.profile_id, p.name, bf.message, bf.category, bf.categories,
           bf.priority, bf.status, bf.screen, bf.device, bf.browser, bf.app_version,
           bf.admin_notes, bf.created_at, bf.updated_at
    from beta_feedback bf
    join profiles p on p.id = bf.profile_id
    where p_status is null or bf.status = p_status
    order by
      case bf.priority when 'critique' then 0 when 'elevee' then 1 when 'moyenne' then 2 else 3 end,
      bf.created_at desc
    limit 200;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select count(*) from admin_list_reports('open'); -- doit être <= 200
-- select count(*) from admin_list_feedback(null);  -- doit être <= 200
-- ============================================================================
