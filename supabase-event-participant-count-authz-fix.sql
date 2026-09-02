-- ============================================================================
-- CORRECTIF — event_participant_count(uuid) sans aucune vérification de
-- visibilité (trouvé lors de l'audit autonome du 2 septembre 2026, passage
-- 148, même angle que les deux correctifs "*-role-authz-fix.sql" —
-- supabase-events-v2.sql).
--
-- event_participant_count() existe en DEUX surcharges :
--   - event_participant_count(e events) : reçoit la ligne "events" ENTIÈRE,
--     donc appelée en pratique comme colonne calculée PostgREST sur un
--     .select('*, event_participant_count') — la ligne "e" n'a pu être
--     lue par le client qu'après passage par la policy SELECT de "events"
--     (using (can_view_event(id))), donc aucun problème : par construction
--     on ne peut jamais recevoir "e" pour un événement qu'on n'a pas le
--     droit de voir. Confirmé par grep sur src/ : les 3 usages existants
--     (CommunitiesTab.jsx, EventsTab.jsx, FeedTab.jsx) passent tous par ce
--     chemin.
--   - event_participant_count(p_event_id uuid) : reçoit seulement un uuid,
--     "security definer", et ne vérifie RIEN — ni can_view_event(), ni
--     aucune autre garde. Cette surcharge n'est appelée nulle part côté
--     client, mais reste exécutable directement par n'importe quel
--     utilisateur connecté via
--     supabase.rpc('event_participant_count', { p_event_id: '<uuid> ' }),
--     ce qui contourne la policy SELECT de "events" et révèle le nombre de
--     participants d'un événement 'private' ou 'community' auquel
--     l'appelant n'a pas accès (il faut connaître/deviner l'uuid, mais
--     c'est exactement le même modèle de menace que user_risk_level()
--     avant son correctif). Sévérité plus faible que les autres correctifs
--     de cette session (un simple compte agrégé, jamais l'identité des
--     participants), mais même défaut de conception : aucune garde là où
--     la RLS de la table qu'elle contourne en a explicitement une.
--
-- Correctif : ajoute la même garde can_view_event() que join_event()/
-- accept_event_invitation() utilisent déjà pour ce genre de vérification.
-- Ne touche PAS la surcharge event_participant_count(e events), déjà saine
-- et utilisée en production par les 3 écrans ci-dessus — la modifier
-- casserait sans raison la colonne calculée. Idempotent (create or
-- replace) — à exécuter une fois dans Supabase SQL Editor, après
-- supabase-events-v2.sql.
-- ============================================================================

create or replace function event_participant_count(p_event_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when can_view_event(p_event_id)
    then (select count(*)::int from event_attendees where event_id = p_event_id and status = 'going')
    else null end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select event_participant_count('<uuid-dun-evenement-prive-auquel-tu-nas-pas-acces>');
-- -- doit renvoyer NULL pour un tel événement, et le vrai compte pour un
-- -- événement public ou auquel tu as accès.
-- ============================================================================
