-- ============================================================================
-- CORRECTIF — admin_resolve_report() : traitement en double d'un même
-- signalement par deux membres du staff plateforme (moderator/admin/
-- super_admin), sans conflit détecté ni signalé (trouvé lors de l'audit du
-- tableau de bord admin, 25 septembre 2026 — même angle et même classe de
-- bug que celui déjà trouvé et corrigé côté "demandes d'adhésion à une
-- communauté", commit `833f240`, accept_join_request/reject_join_request
-- dans supabase-communities.sql).
--
-- Scénario concret : aucun canal Realtime n'existe sur community_reports /
-- event_reports / post_reports / info_reports, donc la file "Signalements"
-- du panneau admin (admin_list_reports, sous-onglet du tableau de bord
-- décrit dans supabase-admin.sql) peut afficher le même signalement à deux
-- membres du staff en même temps. admin_resolve_report(), telle que définie
-- aujourd'hui, fait un simple :
--   update community_reports set status = v_status where id = p_id;
-- sans jamais vérifier que le signalement est encore 'open' avant d'écrire,
-- ni verrouiller la ligne. Si un premier admin clique "Résolu" puis, avant
-- de recharger, un second admin (qui voyait encore la même ligne) clique
-- "Ignorer" sur ce même signalement : le second appel RÉUSSIT sans la
-- moindre erreur, écrase silencieusement le statut ('resolved' -> 'dismissed'
-- ou l'inverse), et une seconde ligne admin_actions contradictoire
-- ('report_resolved' puis 'report_dismissed', ou l'inverse) est journalisée
-- pour un signalement qui n'aurait déjà plus dû être actionnable. Contraste
-- avec accept_join_request/reject_join_request, qui verrouillent la ligne
-- ('for update') et vérifient explicitement status = 'pending' avant
-- d'agir, renvoyant une erreur claire au second appelant plutôt que
-- d'écraser silencieusement la décision du premier.
--
-- Correctif : chaque branche source verrouille désormais sa ligne
-- ('for update') et ne la met à jour QUE si son statut est encore 'open' (ou
-- l'équivalent implicite pour post_reports, dont le statut peut être NULL) ;
-- sinon on lève 'Signalement introuvable ou deja traite', message reconnu
-- par le même motif regex déjà utilisé côté client
-- (isAlreadyDecidedError dans CommunitiesTab.jsx) pour retirer proprement la
-- ligne de la liste plutôt que d'afficher un échec générique — voir le
-- correctif client correspondant (AdminDashboard.jsx, handleResolve) livré
-- avec ce fichier.
--
-- Idempotent (create or replace) — à exécuter une fois dans Supabase SQL
-- Editor, après supabase-admin.sql.
-- ============================================================================

create or replace function admin_resolve_report(p_source text, p_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_dismiss then 'dismissed' else 'resolved' end;
  v_current_status text;
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
  else
    raise exception 'Source inconnue';
  end if;

  insert into admin_actions (actor_id, action_type, metadata)
  values (current_profile_id(), case when p_dismiss then 'report_dismissed' else 'report_resolved' end,
    jsonb_build_object('source', p_source, 'report_id', p_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- -- avec un signalement 'open' existant, appeler admin_resolve_report()
-- -- une première fois (doit réussir) puis une seconde fois sur le même id
-- -- (doit lever 'Signalement introuvable ou deja traite' au lieu d'écraser
-- -- silencieusement le statut déjà posé par le premier appel).
-- ============================================================================
