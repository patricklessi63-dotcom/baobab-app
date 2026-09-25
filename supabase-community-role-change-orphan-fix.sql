-- ============================================================================
-- CORRECTIF — la policy RLS UPDATE de "community_members" ("Changement de
-- role selon la hierarchie") permet à l'unique owner/admin restant de sa
-- communauté de rétrograder SON PROPRE rôle (owner -> admin/moderator/
-- member), l'orphelinant tout aussi sûrement qu'un départ ("Quitter"),
-- pourtant déjà bloqué (commit client eb43ad4 + supabase-community-orphan
-- -guard-fix.sql côté RLS, qui ne couvre QUE la policy DELETE).
--
-- Trouvé lors de l'audit autonome du 25 septembre 2026 du mécanisme de
-- gestion des rôles/exclusion (CommunityMemberRow.jsx, permissions.js),
-- scénario explicitement visé : "l'unique owner se rétrograde lui-même".
--
-- CONFIRMATION QUE CE N'EST PAS DÉJÀ COUVERT :
-- - Côté client, aucune UI n'atteint ce cas : CommunityMemberRow.jsx ne
--   propose jamais de bouton "rétrograder" ciblant la propre ligne du
--   viewer (canPromoteToMod/canDemoteToMember/canPromoteToAdmin/
--   canDemoteToModerator exigent tous un member.role précis qui ne peut
--   jamais correspondre au rôle "owner" affiché sur sa propre ligne — voir
--   permissions.js/canSetRole). wouldOrphanCommunity() (permissions.js)
--   n'est câblée que dans handleLeave (CommunitiesTab.jsx), jamais dans
--   handleSetMemberRole.
-- - Côté serveur, la policy réelle (supabase-communities.sql, ~ligne 131)
--   reste :
--
--     create policy "Changement de role selon la hierarchie"
--     on community_members for update
--     using (
--       community_member_role(community_id, current_profile_id()) = 'owner'
--       or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
--     )
--     with check ( ... même condition ... );
--
--   La branche "owner" est INCONDITIONNELLE : rien n'empêche un owner
--   d'appeler directement supabase.from('community_members').update({role:
--   'member'}).eq('id', <sa_propre_ligne>) — un appel API qui contourne
--   entièrement CommunityMemberRow.jsx/CommunitiesTab.jsx, exactement comme
--   pour le bug DELETE déjà corrigé. Une communauté peut donc encore
--   aujourd'hui se retrouver sans AUCUN owner ni admin par cette voie :
--   plus personne ne peut alors gérer les membres, les demandes d'adhésion
--   ou les signalements, ni promouvoir qui que ce soit (canManageMembers
--   exige déjà owner/admin) — orpheline de façon permanente, sans autre
--   échappatoire que la suppression complète de la communauté.
--   (La branche "admin" n'a pas ce problème : sa propre ligne a le rôle
--   'admin', jamais 'moderator'/'member', donc la condition USING de cette
--   branche exclut déjà structurellement toute auto-modification par un
--   admin.)
--
-- CORRECTIF : réutilise la fonction SECURITY DEFINER
-- community_would_be_orphaned_by_leaving() déjà livrée dans
-- supabase-community-orphan-guard-fix.sql (redéfinie ici aussi, en
-- CREATE OR REPLACE idempotent, pour que ce fichier reste exécutable seul
-- dans l'ordre choisi par Patrick) et l'ajoute UNIQUEMENT dans la clause
-- USING (évaluée sur la ligne AVANT modification — donc sans ambiguïté sur
-- la valeur "role" lue par la fonction, contrairement à WITH CHECK qui
-- porte sur la ligne APRÈS modification). Si la ligne ciblée est refusée
-- par USING, aucune ligne n'est mise à jour (0 row affected) : la clause
-- WITH CHECK d'origine n'a donc pas besoin d'être dupliquée pour que la
-- garde soit effective.
--
-- Ne bloque JAMAIS un changement de rôle légitime :
--   - owner qui modifie le rôle d'un AUTRE membre (profile_id différent) :
--     la garde ne s'applique qu'à profile_id = current_profile_id() ->
--     inchangé, un owner reste libre de gérer les autres.
--   - owner/admin qui se change lui-même de rôle alors qu'il reste AU MOINS
--     UN AUTRE owner/admin -> community_would_be_orphaned_by_leaving(...)
--     renvoie false -> changement autorisé, inchangé.
--   - admin qui modifie un modérateur/membre : branche admin totalement
--     inchangée.
--   - owner unique qui se rétrograde lui-même (seul owner/admin restant) :
--     seul ce cas précis est désormais bloqué.
--
-- Idempotent (create or replace function / drop policy if exists) — à
-- exécuter une fois dans Supabase SQL Editor, après supabase-communities.sql
-- (l'ordre par rapport à supabase-community-orphan-guard-fix.sql n'a pas
-- d'importance, les deux redéfinissent la même fonction à l'identique).
--
-- LIVRÉ POUR EXÉCUTION MANUELLE FUTURE PAR PATRICK — PAS EXÉCUTÉ ICI.
-- ============================================================================

create or replace function community_would_be_orphaned_by_leaving(p_community_id uuid, p_leaving_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select community_member_role(p_community_id, p_leaving_profile_id) in ('owner','admin')
    and not exists (
      select 1 from community_members cm
      where cm.community_id = p_community_id
        and cm.profile_id <> p_leaving_profile_id
        and cm.role in ('owner','admin')
    );
$$;

drop policy if exists "Changement de role selon la hierarchie" on public.community_members;

create policy "Changement de role selon la hierarchie"
on community_members for update
using (
  (
    community_member_role(community_id, current_profile_id()) = 'owner'
    and not (
      profile_id = current_profile_id()
      and community_would_be_orphaned_by_leaving(community_id, current_profile_id())
    )
  )
  or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
)
with check (
  community_member_role(community_id, current_profile_id()) = 'owner'
  or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, connecté en tant
-- que le owner/admin unique d'une communauté de test) :
--
-- -- 1. Doit ÉCHOUER (0 ligne affectée / erreur RLS), tenté en tant que
-- -- l'unique owner d'une communauté de test, sur sa PROPRE ligne :
-- update community_members set role = 'member'
-- where community_id = '<uuid-communaute-test>' and profile_id = '<uuid-profil-owner-unique>';
--
-- -- 2. Doit RÉUSSIR sans changement de comportement : ce même owner change
-- -- le rôle d'un AUTRE membre (promotion/rétrogradation classique).
--
-- -- 3. Doit RÉUSSIR : promouvoir un second membre owner/admin dans cette
-- -- communauté, puis refaire la requête 1 -> doit maintenant réussir (plus
-- -- de risque d'orpheliner la communauté, un autre owner/admin reste).
-- ============================================================================
