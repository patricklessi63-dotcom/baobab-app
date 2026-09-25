-- ============================================================================
-- CORRECTIF — le blocage entre deux profils n'était jamais vérifié côté
-- serveur pour les invitations à une communauté (table "community_invites").
--
-- CONTEXTE : le même trou a déjà été comblé le 2026-09-03/09 pour
-- likes / follows / favorites / event_invitations / messages (voir
-- supabase-target-account-state-guards-CONSOLIDATED-fix.sql). Un audit du
-- flux d'invitations (2026-09-25) a établi que "community_invites" n'a
-- JAMAIS fait partie de cette liste : sa policy INSERT d'origine
-- (supabase-communities.sql, section 8) vérifie seulement que l'auteur est
-- bien lui-même ("invited_by = current_profile_id()") et qu'il est staff de
-- la communauté ("is_community_staff(community_id)") — aucune vérification
-- d'un blocage existant entre le staff et le profil invité.
--
-- IMPACT CONCRET : le filtrage des profils bloqués/bloquants dans le modal
-- d'invitation (CommunityInviteModal.jsx) est fait CÔTÉ CLIENT uniquement.
-- Un membre du staff d'une communauté peut donc, via un appel direct à
-- l'API Supabase (fetch/PostgREST, en contournant l'UI), créer une ligne
-- "community_invites" ciblant un profil qui l'a bloqué (ou qu'il a
-- lui-même bloqué) — ce qui déclenche une notification "community_invite"
-- vers ce profil (trigger trg_notify_invite), soit un contact indirect
-- malgré le blocage.
--
-- CORRECTIF : réplique exactement le garde-fou "not exists (select 1 from
-- blocks where ...)" déjà utilisé pour les 5 tables ci-dessus, sur la
-- policy INSERT de "community_invites". Additif et sans risque de
-- régression : un staff qui invite un profil non bloqué n'est jamais
-- affecté, la condition n'ajoute qu'un NOT EXISTS supplémentaire au check
-- déjà en place.
--
-- À exécuter une seule fois, dans le SQL Editor de Supabase. Idempotent
-- (drop + create) : peut être rejoué sans risque.
-- ============================================================================

drop policy if exists "Le staff cree des invitations" on community_invites;
create policy "Le staff cree des invitations"
on community_invites for insert
with check (
  invited_by = current_profile_id()
  and is_community_staff(community_id)
  and not exists (
    select 1 from blocks
    where (blocks.from_id = invited_by and blocks.to_id = invited_profile_id)
       or (blocks.from_id = invited_profile_id and blocks.to_id = invited_by)
  )
);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd, pg_get_expr(polwithcheck, polrelid)
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname = 'community_invites';
-- ============================================================================
