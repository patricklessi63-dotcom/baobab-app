-- ============================================================================
-- CORRECTIF — la policy RLS DELETE de "community_members" n'empêche pas un
-- owner/admin unique d'orpheliner sa communauté (trouvé lors de l'audit
-- autonome du 18 septembre 2026, en complément du commit client eb43ad4
-- qui n'avait corrigé que l'UI).
--
-- RAPPEL DU BUG (déjà identifié côté client, voir
-- src/lib/communities/permissions.js, fonction wouldOrphanCommunity()) :
-- un owner/admin qui est le SEUL owner/admin restant d'une communauté peut
-- quitter cette communauté (bouton "Quitter"), la laissant sans owner ni
-- admin — plus personne ne peut alors gérer les membres, les demandes
-- d'adhésion ou les signalements, ni même promouvoir quelqu'un d'autre
-- (canSetRole exige déjà d'être owner ou admin pour changer un rôle).
-- Communauté orpheline de façon permanente, sans échappatoire autre que sa
-- suppression complète.
--
-- Le commit eb43ad4 a bien branché wouldOrphanCommunity() dans le
-- handleLeave() de CommunitiesTab.jsx : le bouton "Quitter" est désormais
-- bloqué dans l'UI normale de l'app. MAIS la vraie source de vérité pour
-- une policy RLS n'est jamais le client (voir le commentaire en tête de
-- permissions.js : "ce fichier ne doit jamais être considéré comme une
-- barrière de sécurité") — et la policy RLS réelle de "community_members"
-- (supabase-communities.sql, ~ligne 142) n'a AUCUNE garde équivalente :
--
--   create policy "Quitter ou etre retire selon la hierarchie"
--   on community_members for delete
--   using (
--     profile_id = current_profile_id()
--     or (community_member_role(community_id, current_profile_id()) = 'owner' and profile_id <> current_profile_id())
--     or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
--   );
--
-- La toute première branche ("profile_id = current_profile_id()") autorise
-- INCONDITIONNELLEMENT n'importe quel membre — owner/admin compris — à
-- supprimer sa propre ligne "community_members". Un appel API direct
-- (supabase.from('community_members').delete().eq('profile_id', ...)),
-- contournant complètement CommunitiesTab.jsx, orpheline donc toujours la
-- communauté aujourd'hui, malgré le correctif client déjà déployé.
--
-- Schéma concerné (supabase-communities.sql, ~ligne 25) :
--   community_members(id, community_id, profile_id, role, joined_at)
--   role text not null default 'member' check (role in ('owner','admin','moderator','member'))
--
-- CORRECTIF : ajoute une fonction SECURITY DEFINER, réutilisant le style
-- déjà en place dans supabase-communities.sql (current_profile_id(),
-- community_member_role(), etc.), qui détecte si le retrait d'un membre
-- donné orphelinerait sa communauté (owner/admin ET aucun AUTRE owner/admin
-- restant). Puis remplace la policy DELETE pour n'ajouter cette garde QUE
-- sur la branche "je me retire moi-même" — les deux autres branches
-- (retrait d'un AUTRE membre par un owner, ou par un admin sur un
-- modérateur/membre — c'est-à-dire la modération, pas un départ
-- volontaire) restent RIGOUREUSEMENT inchangées, comme demandé : un owner
-- ou un admin reste toujours libre d'expulser quelqu'un d'autre, même si
-- ça change la composition du staff, seul SON PROPRE départ volontaire est
-- concerné par cette garde.
--
-- Ne bloque JAMAIS un départ normal :
--   - simple membre/modérateur qui quitte : community_member_role(...) n'est
--     ni 'owner' ni 'admin' -> la fonction renvoie false -> inchangé.
--   - owner/admin qui quitte alors qu'il reste AU MOINS UN AUTRE owner/admin
--     -> exists(...) trouve cet autre owner/admin -> la fonction renvoie
--     false -> départ autorisé, inchangé.
--   - owner/admin qui quitte en étant le DERNIER owner/admin -> la fonction
--     renvoie true -> ce cas précis, et uniquement celui-ci, est bloqué.
--
-- Idempotent (create or replace function / drop policy if exists — pas de
-- boucle sur pg_policies ici, une seule policy DELETE nommée existe sur
-- cette table, voir supabase-communities.sql) — à exécuter une fois dans
-- Supabase SQL Editor, après supabase-communities.sql.
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

drop policy if exists "Quitter ou etre retire selon la hierarchie" on public.community_members;

create policy "Quitter ou etre retire selon la hierarchie"
on community_members for delete
using (
  (profile_id = current_profile_id() and not community_would_be_orphaned_by_leaving(community_id, current_profile_id()))
  or (community_member_role(community_id, current_profile_id()) = 'owner' and profile_id <> current_profile_id())
  or (community_member_role(community_id, current_profile_id()) = 'admin' and role in ('moderator','member'))
);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, connecté en tant
-- que le owner/admin unique d'une communauté de test) :
--
-- -- 1. Doit renvoyer "true" pour l'owner unique d'une communauté de test :
-- select community_would_be_orphaned_by_leaving('<uuid-communaute-test>', '<uuid-profil-owner-unique>');
--
-- -- 2. Doit ÉCHOUER (0 ligne affectée / erreur RLS), tenté en tant que ce
-- -- même owner unique :
-- delete from community_members
-- where community_id = '<uuid-communaute-test>' and profile_id = '<uuid-profil-owner-unique>';
--
-- -- 3. Doit RÉUSSIR : promouvoir un second membre owner/admin dans cette
-- -- communauté, puis refaire la requête 1 -> doit maintenant renvoyer "false" ;
-- -- refaire la requête 2 -> doit maintenant réussir (départ normal, plus de
-- -- risque d'orpheliner la communauté).
--
-- -- 4. Doit RÉUSSIR sans changement de comportement : un simple membre qui
-- -- quitte, ou un owner qui expulse un autre membre.
-- ============================================================================
