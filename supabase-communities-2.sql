-- ============================================================================
-- Phase — Baobab Communautés 2.0 — à exécuter dans Supabase : SQL Editor
-- (une fois).
-- ============================================================================
-- AUDIT PRÉALABLE (résumé, voir rapport final pour le détail complet) :
-- communities/community_members/community_join_requests/community_posts/
-- community_post_likes/community_comments/community_reports/
-- community_invites existent déjà avec une RLS très complète (rôles
-- hiérarchiques, visibilité public/privé/invite_only, notifications).
-- Les événements liés à une communauté fonctionnent déjà entièrement
-- (create_event accepte p_community_id, EventCreateForm le propose).
-- Ce fichier n'ajoute QUE les vraies lacunes confirmées par l'audit :
-- règles de communauté (jamais eu de colonne) et une façon pour
-- l'invité·e de décliner une invitation (accept_invite existait déjà,
-- aucun chemin de refus).

-- ----------------------------------------------------------------------------
-- 1. Règles de communauté (section 34 du cahier des charges).
-- ----------------------------------------------------------------------------
alter table communities add column if not exists rules text;

create or replace function create_community(
  p_name text, p_description text, p_category text, p_city text, p_visibility text, p_cover_url text, p_rules text default null
)
returns communities
language plpgsql security definer set search_path = public
as $$
declare v_community communities;
begin
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Le nom est requis';
  end if;
  insert into communities (name, description, category, city, visibility, cover_url, rules, created_by)
  values (trim(p_name), p_description, p_category, p_city, coalesce(p_visibility, 'public'), p_cover_url, p_rules, current_profile_id())
  returning * into v_community;

  insert into community_members (community_id, profile_id, role)
  values (v_community.id, current_profile_id(), 'owner');

  return v_community;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Décliner une invitation (section 27) — accept_invite existait déjà,
-- mais l'invité·e n'avait aucun moyen de refuser (seul le staff peut
-- UPDATE community_invites via RLS). RPC security definer symétrique,
-- même garde d'authenticité que accept_invite.
-- ----------------------------------------------------------------------------
create or replace function decline_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update community_invites
  set status = 'revoked'
  where id = p_invite_id and status = 'pending' and invited_profile_id = current_profile_id();
  if not found then
    raise exception 'Invitation introuvable ou deja traitee';
  end if;
end;
$$;

revoke all on function decline_invite(uuid) from public;
grant execute on function decline_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns where table_name='communities' and column_name='rules';
-- select proname from pg_proc where proname in ('create_community','decline_invite');
-- ============================================================================
