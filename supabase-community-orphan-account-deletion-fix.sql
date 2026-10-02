-- ============================================================================
-- CORRECTIF — les deux filets de sécurité "communauté orpheline" déjà livrés
-- (supabase-community-orphan-guard-fix.sql sur la policy DELETE,
-- supabase-community-role-change-orphan-fix.sql sur la policy UPDATE) ne
-- protègent QUE les actions directes d'un utilisateur authentifié sur
-- "community_members" (départ volontaire / auto-rétrogradation). Aucun des
-- deux ne protège le chemin de la SUPPRESSION DE COMPTE, trouvé lors de
-- l'audit autonome du 2 octobre 2026 — vérifié par lecture seule de
-- supabase-communities.sql, supabase-account-deletion.sql et
-- supabase/functions/process-scheduled-deletions/index.ts, aucun fichier
-- supabase-*.sql modifié pour cette vérification.
--
-- LE TROU, CONFIRMÉ (pas supposé) :
--
-- 1. `community_members.profile_id` référence `profiles(id) on delete
--    cascade` (supabase-communities.sql, ~ligne 28). Quand une ligne
--    "profiles" est supprimée, Postgres supprime donc AUSSI la ligne
--    "community_members" de ce profil pour CHAQUE communauté — y compris
--    sa ligne role='owner' s'il est propriétaire d'une communauté.
--
-- 2. Cette suppression cascade n'est PAS un "DELETE ... WHERE profile_id =
--    current_profile_id()" exécuté par l'utilisateur : c'est une action
--    référentielle interne déclenchée par la suppression de "profiles".
--    Une policy RLS "for delete" sur "community_members" (comme "Quitter ou
--    etre retire selon la hierarchie", déjà resserrée par
--    supabase-community-orphan-guard-fix.sql) ne s'applique QU'aux
--    instructions DELETE émises explicitement contre cette table par un
--    rôle soumis à la RLS — jamais à une suppression cascade déclenchée par
--    une contrainte de clé étrangère. Le garde-fou RLS existant est donc
--    structurellement invisible à ce chemin, peu importe à quel point il
--    est resserré.
--
-- 3. Et même si ce n'était pas le cas : la suppression de compte réelle
--    (supabase/functions/process-scheduled-deletions/index.ts, ligne ~153)
--    appelle `admin.auth.admin.deleteUser(profile.user_id)` avec le client
--    SERVICE ROLE (voir supabase-account-deletion.sql, tâche pg_cron qui
--    invoke cette fonction avec le secret Vault "service_role_key"). Le rôle
--    service_role contourne TOUJOURS la RLS, par conception Postgres/
--    Supabase — une deuxième raison, indépendante de la première,
--    expliquant pourquoi aucune policy RLS ne peut jamais intercepter ce
--    chemin. "profiles.user_id" référence "auth.users(id) on delete cascade"
--    (supabase-scale-security-2.sql, §4) : supprimer l'utilisateur auth
--    cascade sur "profiles", qui cascade à son tour sur "community_members".
--
-- CONSÉQUENCE RÉELLE : un·e owner (ou admin) unique d'une communauté qui
-- supprime son compte — immédiatement via l'ancien chemin, ou après le délai
-- de grâce de 24h via process-scheduled-deletions — orpheline cette
-- communauté exactement comme le départ volontaire déjà corrigé : plus
-- personne ne peut alors gérer les membres, traiter les demandes d'adhésion
-- (accept_join_request/reject_join_request exigent is_community_staff) ni
-- les signalements (is_community_mod), ni promouvoir qui que ce soit
-- (canSetRole/la policy UPDATE exigent déjà d'être owner/admin). Le trou
-- "communauté orpheline" déjà identifié en théorie par l'audit du départ
-- volontaire (voir supabase-community-orphan-guard-fix.sql) existe donc
-- bel et bien pour CE chemin précis, qui n'avait jamais été vérifié.
--
-- Vérifié séparément : côté client, ni CommunitiesTab.jsx ni
-- CommunityDetailView.jsx ne plantent sur une communauté orpheline. Tous les
-- contrôles d'affichage (isStaff/isMod dans permissions.js, viewerRole ===
-- "owner" dans CommunityDetailView.jsx) traitent une absence de staff avec
-- grâce : les boutons "Inviter", "Supprimer la communauté" (sauf pour un
-- admin plateforme, qui reste toujours une échappatoire) et l'onglet
-- "Gestion" disparaissent simplement pour tout le monde, laissant la
-- communauté lisible/postable normalement (member reste member) mais plus
-- jamais administrable par un membre ordinaire. Aucun composant ne fait de
-- `members.find(m => m.role === 'owner')` en supposant le résultat non-null.
-- Donc : trou de GESTION confirmé, pas de trou de PLANTAGE côté client —
-- rien à corriger dans les fichiers .jsx pour cette session.
--
-- RÉFLEXION SUR L'APPROCHE LA PLUS SÛRE (deux options envisagées) :
--
-- Option A — bloquer la suppression du PROFIL (trigger BEFORE DELETE on
-- profiles qui lève une exception si ce profil est le dernier owner/admin
-- d'une communauté ayant d'autres membres). REJETÉE : process-scheduled-
-- deletions appellerait alors `admin.auth.admin.deleteUser(...)`, qui
-- cascaderait sur "profiles", qui ferait échouer le trigger — la suppression
-- de CE compte échouerait silencieusement, à chaque exécution du cron
-- (toutes les heures), indéfiniment, sans jamais prévenir l'utilisateur
-- (AccountDeletionBanner.jsx affiche juste "sera supprimé dans 24h", aucun
-- mécanisme pour remonter un échec serveur). Un·e utilisateur·rice qui a
-- demandé la suppression de son compte — et peut très bien ne plus jamais se
-- reconnecter à l'app après la fin du délai de grâce — se retrouverait avec
-- un compte jamais réellement supprimé, en échec muet permanent. Pire que le
-- bug qu'on corrige.
--
-- Option B (retenue) — transférer automatiquement la propriété au lieu de
-- bloquer. Un trigger BEFORE DELETE FOR EACH ROW sur "community_members"
-- lui-même (qui se déclenche aussi pour les lignes supprimées par cascade,
-- comportement standard Postgres pour les triggers ROW) détecte si la ligne
-- en cours de suppression est le dernier owner/admin de sa communauté
-- (même fonction SECURITY DEFINER `community_would_be_orphaned_by_leaving`
-- déjà livrée et réutilisée ici en CREATE OR REPLACE idempotent) et, si oui,
-- promeut automatiquement "owner" le membre restant le mieux placé (un
-- modérateur existant de préférence, sinon le membre le plus ancien par
-- `joined_at`) AVANT que la ligne ne disparaisse. Ne bloque jamais rien :
-- la suppression de compte continue de réussir normalement, la communauté
-- garde un responsable identifiable tant qu'il lui reste au moins un autre
-- membre. S'applique uniformément, peu importe QUI a déclenché la
-- suppression (départ volontaire déjà bloqué par la RLS en amont donc ce
-- trigger n'a jamais rien à faire dans ce cas précis ; expulsion par le
-- staff, qui ne peut déjà pas cibler le dernier owner/admin restant vu les
-- policies existantes ; ou suppression de compte / cascade, le seul chemin
-- réellement concerné par ce fichier).
--
-- LIMITE RÉSIDUELLE DOCUMENTÉE (pas un bug introduit par ce fichier, un cas
-- limite déjà inévitable) : si l'owner/admin supprimé était l'UNIQUE membre
-- de sa communauté (aucun autre membre à promouvoir), la communauté survit
-- (communities.created_by passe déjà à NULL, "on delete set null") mais
-- devient une coquille à zéro membre, sans owner ni admin, et le restera
-- (un nouveau membre qui la rejoint n'a aucun moyen de devenir owner/admin
-- sans qu'un owner/admin existant ne le promeuve). Seule échappatoire :
-- suppression complète par un administrateur plateforme (déjà possible
-- aujourd'hui, CommunityDetailView.jsx ligne ~153, `isPlatformAdmin`). Ce
-- cas est volontairement laissé tel quel : bloquer la suppression de compte
-- pour une communauté qui n'a plus AUCUN autre membre reproduirait
-- exactement le problème de l'option A rejetée ci-dessus, pour un bénéfice
-- quasi nul (une communauté à un seul membre n'a jamais eu de modération
-- active à préserver).
--
-- Idempotent (create or replace function / drop trigger if exists) — à
-- exécuter une fois dans Supabase SQL Editor, après supabase-communities.sql
-- (l'ordre par rapport aux deux autres fichiers "orphan-*-fix.sql" n'a pas
-- d'importance, les trois redéfinissent la même fonction à l'identique).
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

-- Choisit le successeur : un modérateur existant en priorité (déjà un
-- minimum de confiance accordée dans cette communauté), sinon le membre le
-- plus ancien (joined_at croissant). Ne s'exécute que quand la fonction
-- ci-dessus a déjà confirmé qu'aucun autre owner/admin n'existe (sinon ce
-- trigger n'a rien à faire : sans cette garde, "moderator" serait toujours
-- préféré à un admin/owner existant par erreur).
create or replace function community_promote_successor_on_departure()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_successor_id uuid;
begin
  if OLD.role in ('owner','admin') and community_would_be_orphaned_by_leaving(OLD.community_id, OLD.profile_id) then
    select cm.profile_id into v_successor_id
    from community_members cm
    where cm.community_id = OLD.community_id
      and cm.profile_id <> OLD.profile_id
    order by (cm.role = 'moderator') desc, cm.joined_at asc
    limit 1;

    if v_successor_id is not null then
      update community_members
      set role = 'owner'
      where community_id = OLD.community_id and profile_id = v_successor_id;
    end if;
    -- Si v_successor_id est null (aucun autre membre), rien à faire : voir
    -- "LIMITE RÉSIDUELLE DOCUMENTÉE" en en-tête de ce fichier.
  end if;
  return OLD;
end;
$$;

drop trigger if exists community_members_promote_successor on public.community_members;

create trigger community_members_promote_successor
before delete on community_members
for each row
execute function community_promote_successor_on_departure();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, avec une communauté
-- de test ayant un owner unique + au moins un autre membre "moderator" ou
-- "member") :
--
-- -- 1. Avant : noter l'owner unique et un autre membre (ex. "moderator").
-- select profile_id, role, joined_at from community_members
-- where community_id = '<uuid-communaute-test>' order by joined_at;
--
-- -- 2. Simuler la cascade de suppression de compte (connecté en SQL Editor,
-- -- donc avec les droits service role qui contournent déjà la RLS, comme le
-- -- ferait réellement process-scheduled-deletions) :
-- delete from community_members
-- where community_id = '<uuid-communaute-test>' and profile_id = '<uuid-profil-owner-unique>';
--
-- -- 3. Après : le membre "moderator" (ou le plus ancien des restants s'il
-- -- n'y avait pas de modérateur) doit maintenant apparaître role='owner' :
-- select profile_id, role, joined_at from community_members
-- where community_id = '<uuid-communaute-test>' order by joined_at;
--
-- -- 4. Contrôle négatif : si un AUTRE owner/admin existait déjà avant le
-- -- DELETE, aucune ligne ne doit changer de rôle suite à ce DELETE (le
-- -- trigger ne doit rien faire quand la communauté n'est pas réellement
-- -- orpheline).
-- ============================================================================
