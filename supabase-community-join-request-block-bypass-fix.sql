-- ============================================================================
-- CORRECTIF — le blocage entre deux profils n'était jamais vérifié avant de
-- notifier le staff d'une communauté qu'une nouvelle demande d'adhésion
-- vient d'être déposée (table "community_join_requests").
--
-- CONTEXTE : le même trou a déjà été comblé le 2026-09-03/09 pour
-- likes/follows/favorites/event_invitations/messages (voir
-- supabase-target-account-state-guards-CONSOLIDATED-fix.sql), puis le
-- 2026-09-25 pour les invitations à une communauté (voir
-- supabase-community-invite-block-bypass-fix.sql, policy INSERT de
-- "community_invites"). Un audit du flux SYMÉTRIQUE — la "demande
-- d'adhésion" qu'un membre envoie lui-même pour rejoindre une communauté
-- privée, jamais audité jusqu'ici — montre que "community_join_requests" a
-- le même trou, sous une forme différente : ce n'est pas la policy INSERT
-- elle-même qui pose problème (le demandeur ne choisit qu'une communauté,
-- jamais un profil précis à contacter), mais le trigger de notification qui
-- suit l'insertion.
--
-- Constat (lecture de supabase-communities.sql, section 11) :
--   create function notify_join_request() ...
--     insert into notifications (recipient_id, type, actor_id, ...)
--     select cm.profile_id, 'join_request_received', new.profile_id, ...
--     from community_members cm
--     where cm.community_id = new.community_id and cm.role in ('owner','admin');
-- Ce trigger (AFTER INSERT, SECURITY DEFINER, sans condition sur le
-- blocage) notifie INCONDITIONNELLEMENT tout le staff (owner/admin) de la
-- communauté visée, avec actor_id = le profil du demandeur. Un utilisateur
-- peut donc aujourd'hui, en toute légitimité (interface normale, aucun
-- contournement API nécessaire), déposer une demande d'adhésion à une
-- communauté privée dont il sait qu'un owner/admin l'a bloqué (ou qu'il a
-- lui-même bloqué) : ce membre du staff reçoit quand même une notification
-- "join_request_received" nommant explicitement le demandeur — exactement
-- le même bypass de blocage qu'une invitation ou un message direct, juste
-- via une notification plutôt qu'un contenu.
--
-- IMPACT CONCRET : contact indirect malgré un blocage mutuel, à l'identique
-- du scénario déjà corrigé pour community_invites — sauf qu'ici c'est le
-- demandeur potentiellement bloqué/bloquant qui déclenche lui-même l'envoi
-- en soumettant sa demande, sans que la policy INSERT (qui ne connaît pas
-- l'identité des futurs destinataires de la notification) puisse
-- l'empêcher en amont.
--
-- CORRECTIF : le trigger ne notifie plus un membre du staff avec lequel le
-- demandeur a un blocage (dans un sens ou dans l'autre) — même garde-fou
-- "not exists (select 1 from blocks where ...)" que les fichiers cités
-- ci-dessus, appliqué ligne par ligne au SELECT du trigger plutôt qu'à une
-- policy INSERT. La demande elle-même reste créée normalement (elle peut
-- toujours être vue et traitée par les AUTRES membres du staff, non
-- bloqués) : seule la notification vers le(s) membre(s) du staff bloqué(s)
-- est supprimée. Additif et sans risque de régression : un staff non
-- bloqué avec le demandeur continue de recevoir sa notification exactement
-- comme avant.
--
-- À exécuter une seule fois, dans le SQL Editor de Supabase, après
-- supabase-communities.sql (dont la fonction notify_join_request()
-- doit déjà exister). Idempotent (create or replace) : peut être rejoué
-- sans risque.
-- ============================================================================

create or replace function notify_join_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, community_id, target_type, target_id)
  select cm.profile_id, 'join_request_received', new.profile_id, new.community_id, 'join_request', new.id
  from community_members cm
  where cm.community_id = new.community_id
    and cm.role in ('owner','admin')
    and not exists (
      select 1 from blocks
      where (blocks.from_id = cm.profile_id and blocks.to_id = new.profile_id)
         or (blocks.from_id = new.profile_id and blocks.to_id = cm.profile_id)
    );
  return new;
end; $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select prosrc from pg_proc where proname = 'notify_join_request';
-- -- Confirmer la présence du "not exists (select 1 from blocks ...)" ci-dessus.
-- ============================================================================
