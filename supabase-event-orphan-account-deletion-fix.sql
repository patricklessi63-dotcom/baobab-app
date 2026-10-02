-- ============================================================================
-- CORRECTIF — vérification du bug "communauté orpheline par suppression de
-- compte" (supabase-community-orphan-account-deletion-fix.sql) pour son
-- équivalent EVENEMENT, demandée le 2 octobre 2026. Audit en LECTURE SEULE de
-- supabase-events-v2.sql, supabase-create-community-event-authz-fix.sql,
-- supabase-events-timezone.sql, supabase-account-deletion.sql et
-- supabase/functions/process-scheduled-deletions/index.ts — aucun fichier
-- supabase-*.sql modifié pour cette vérification.
--
-- LE TROU, CONFIRMÉ (pas supposé par analogie) :
--
-- 1. `event_staff.profile_id` référence `profiles(id) on delete cascade`
--    (supabase-events-v2.sql, ~ligne 77) — exactement comme
--    `community_members.profile_id`. Supprimer une ligne "profiles" supprime
--    donc par cascade TOUTES ses lignes "event_staff", y compris une ligne
--    role='organizer'.
--
-- 2. CONTRAIREMENT à "community_members", la policy RLS DELETE existante sur
--    "event_staff" (supabase-events-v2.sql, ~ligne 261, "Quitter le staff ou
--    etre retire par l'organisateur") interdit DÉJÀ, depuis l'origine, à un
--    organisateur de supprimer sa propre ligne par un appel direct :
--
--      using (
--        (profile_id = current_profile_id() and role <> 'organizer')
--        or (event_staff_role(event_id, current_profile_id()) = 'organizer'
--            and profile_id <> current_profile_id())
--      )
--
--    La branche "je me retire moi-même" exige `role <> 'organizer'`, donc un
--    organisateur qui tente `DELETE ... WHERE profile_id = current_profile_id()`
--    sur sa propre ligne organizer échoue déjà (0 ligne affectée). La seconde
--    branche exige `profile_id <> current_profile_id()`, donc un organisateur
--    ne peut pas non plus se cibler lui-même via cette branche. Pas de bug
--    analogue à celui trouvé sur "community_members" ici : le départ
--    volontaire d'un organisateur unique est déjà bloqué par la RLS
--    aujourd'hui, sans qu'aucun correctif supplémentaire soit nécessaire sur
--    cette policy. (Vérifié précisément, pas supposé par analogie avec le
--    fichier communauté — c'est la différence clé avec ce cas.)
--
-- 3. MAIS exactement comme pour "community_members", une policy RLS ne
--    s'applique QU'aux instructions DELETE émises explicitement par un rôle
--    soumis à la RLS — jamais à une suppression cascade déclenchée par une
--    contrainte de clé étrangère. Peu importe que la policy DELETE soit déjà
--    correcte : elle est structurellement invisible au chemin de la
--    suppression de compte.
--
-- 4. Et la suppression de compte réelle (process-scheduled-deletions/
--    index.ts, ~ligne 153, `admin.auth.admin.deleteUser(profile.user_id)`)
--    utilise de toute façon le client SERVICE ROLE, qui contourne TOUJOURS
--    la RLS par conception — une seconde raison indépendante, identique à
--    celle du fichier communauté.
--
-- CONSÉQUENCE RÉELLE, CONFIRMÉE : un organisateur d'événement qui supprime
-- son compte (immédiatement ou après le délai de grâce de 24h) orpheline son
-- événement — `event_staff` perd sa ligne role='organizer' par cascade, et
-- plus personne ne peut alors éditer l'événement (policy UPDATE "Le staff
-- modifie son evenement" exige is_event_staff = organizer/co_organizer),
-- l'annuler (canCancelEvent côté client exige la même chose), modérer les
-- signalements (is_event_mod), ni surtout repromouvoir qui que ce soit
-- "organizer" (la policy UPDATE de event_staff n'autorise CE changement de
-- rôle précis qu'à un organizer déjà existant — un co_organizer ne peut
-- promouvoir que vers 'moderator', jamais vers 'organizer'). Une fois la
-- dernière ligne 'organizer' disparue, ce rôle ne peut structurellement plus
-- jamais être réattribué par personne dans l'app. Même trou que les
-- communautés, confirmé pour ce chemin précis.
--
-- LIMITE RÉALISTE DÉJÀ DOCUMENTÉE (pas un nouveau problème introduit par ce
-- fichier) : un audit antérieur a confirmé que la fonctionnalité "ajouter un
-- co-organisateur" n'est en réalité JAMAIS câblée côté client aujourd'hui.
-- Vérifié ici à nouveau par lecture seule :
--   - `src/lib/events/permissions.js` définit bien `canManageEventStaff()`,
--     `canSetEventRole()` et `canRemoveEventStaff()`, mais AUCUN des trois
--     n'est importé ni appelé par un composant .jsx (seul leur propre fichier
--     de test les utilise) — recherche exhaustive dans tout `src/`.
--   - Le seul point d'insertion dans "event_staff" dans tout le dépôt SQL est
--     `create_event()` (redéfini de façon identique dans
--     supabase-create-community-event-authz-fix.sql et
--     supabase-events-timezone.sql), qui insère EXACTEMENT une ligne
--     `(event_id, profile_id=current_profile_id(), role='organizer')` pour
--     le créateur — aucun second insert, nulle part, pour un co-organisateur
--     ou un modérateur.
--   - `EventsTab.jsx`/`EventDetailView.jsx` ne chargent d'ailleurs jamais la
--     liste complète de "event_staff" pour un événement (seule requête :
--     `.eq('profile_id', currentUser.id).maybeSingle()`, le rôle du
--     spectateur courant) — il n'existe nulle part de vue "gérer le staff".
--
-- EN PRATIQUE, DONC : la quasi-totalité des événements n'ont qu'UNE seule
-- ligne "event_staff" (l'organisateur créateur). Le trigger de transfert
-- ci-dessous ne trouvera donc presque jamais de second membre du staff à qui
-- transférer le rôle 'organizer', et la plupart des événements dont le
-- créateur supprime son compte deviendront des coquilles sans organisateur,
-- exactement comme documenté pour les communautés à un seul membre. Ce
-- n'est PAS une régression introduite ici : c'est une limite déjà inhérente
-- à l'absence de la fonctionnalité "co-organisateur" dans l'app, qui existe
-- avec ou sans ce trigger. Le trigger reste la bonne chose à livrer : il
-- gère correctement les (rares, futurs ou créés manuellement en base) cas où
-- un événement a réellement plusieurs lignes "event_staff", et ne change
-- rien au cas majoritaire (aucune régression possible, un événement à staff
-- unique se comporte exactement comme aujourd'hui).
--
-- RÉFLEXION SUR L'APPROCHE (même raisonnement que le fichier communauté) :
--
-- Option A — bloquer la suppression du PROFIL si organisateur unique.
-- REJETÉE, pour la même raison que pour les communautés : la suppression de
-- CE compte échouerait silencieusement et indéfiniment à chaque passage du
-- cron `process-scheduled-deletions`, sans jamais prévenir l'utilisateur·rice
-- (AccountDeletionBanner.jsx n'a aucun mécanisme pour remonter un échec
-- serveur). Pire que le bug corrigé.
--
-- Option B (retenue) — transférer automatiquement le rôle 'organizer' au
-- meilleur candidat restant, via un trigger BEFORE DELETE FOR EACH ROW sur
-- "event_staff" lui-même (déclenché aussi pour les suppressions cascade,
-- comportement standard des triggers ROW de Postgres). Priorité de
-- succession : un co_organizer existant d'abord (déjà la confiance la plus
-- proche de l'organisateur), sinon un moderator, sinon le membre du staff le
-- plus ancien (created_at croissant) parmi ceux qui restent. Ne bloque
-- jamais la suppression de compte.
--
-- Condition d'orphelinage : contrairement aux communautés (où 'owner' ET
-- 'admin' sont tous les deux des rôles "de sommet" interchangeables), pour
-- les événements seul 'organizer' peut à la fois éditer l'événement ET
-- repromouvoir quelqu'un d'autre 'organizer' — un co_organizer restant ne
-- peut jamais, via la policy UPDATE existante, se repromouvoir ni promouvoir
-- quelqu'un d'autre à 'organizer'. La fonction ci-dessous reflète donc cette
-- différence structurelle : elle se déclenche dès que la ligne qui part a
-- role='organizer' ET qu'aucune AUTRE ligne 'organizer' ne reste (un
-- co_organizer ou moderator restant ne suffit PAS à éviter l'orphelinage du
-- rôle 'organizer' lui-même, mais suffit à fournir un successeur à
-- promouvoir).
--
-- LIMITE RÉSIDUELLE DOCUMENTÉE (identique en nature à celle du fichier
-- communauté) : si l'organisateur supprimé était l'UNIQUE ligne "event_staff"
-- de l'événement (cas très majoritaire aujourd'hui, voir ci-dessus),
-- l'événement survit (events.created_by passe déjà à NULL, "on delete set
-- null", vérifié dans supabase-events.sql) mais devient une coquille sans
-- aucun staff, et le restera : personne ne peut plus l'éditer, l'annuler ni
-- modérer ses signalements. Aucune policy INSERT n'existe sur "event_staff"
-- (voir le commentaire "Point de securite critique" dans
-- supabase-events-v2.sql) donc même un administrateur plateforme ne peut pas
-- se réinsérer comme organisateur par un simple appel API — seule
-- échappatoire : une correction manuelle en base par un administrateur, ou
-- laisser l'événement expirer naturellement (il n'a pas de policy DELETE non
-- plus, par conception — voir le commentaire correspondant dans
-- supabase-events-v2.sql, "preferer annulation / archivage"). Ce cas est
-- volontairement laissé tel quel, pour la même raison que pour les
-- communautés à un seul membre : bloquer la suppression de compte
-- reproduirait le problème de l'option A rejetée, pour un événement qui n'a
-- de toute façon jamais eu de second organisateur à préserver.
--
-- Idempotent (create or replace function / drop trigger if exists) — à
-- exécuter une fois dans Supabase SQL Editor, après supabase-events-v2.sql.
--
-- LIVRÉ POUR EXÉCUTION MANUELLE FUTURE PAR PATRICK — PAS EXÉCUTÉ ICI.
-- ============================================================================

create or replace function event_would_be_orphaned_by_leaving(p_event_id uuid, p_leaving_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select event_staff_role(p_event_id, p_leaving_profile_id) = 'organizer'
    and not exists (
      select 1 from event_staff es
      where es.event_id = p_event_id
        and es.profile_id <> p_leaving_profile_id
        and es.role = 'organizer'
    );
$$;

-- Choisit le successeur : un co_organizer existant en priorité (le rôle le
-- plus proche d'un organisateur), sinon un moderator, sinon le membre du
-- staff restant le plus ancien (created_at croissant). Ne s'exécute que
-- quand la fonction ci-dessus a déjà confirmé qu'aucun autre 'organizer'
-- n'existe.
create or replace function event_staff_promote_successor_on_departure()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_successor_id uuid;
begin
  if OLD.role = 'organizer' and event_would_be_orphaned_by_leaving(OLD.event_id, OLD.profile_id) then
    select es.profile_id into v_successor_id
    from event_staff es
    where es.event_id = OLD.event_id
      and es.profile_id <> OLD.profile_id
    order by (es.role = 'co_organizer') desc, (es.role = 'moderator') desc, es.created_at asc
    limit 1;

    if v_successor_id is not null then
      update event_staff
      set role = 'organizer'
      where event_id = OLD.event_id and profile_id = v_successor_id;
    end if;
    -- Si v_successor_id est null (aucun autre membre du staff — le cas très
    -- majoritaire aujourd'hui, voir "LIMITE RÉSIDUELLE DOCUMENTÉE" en
    -- en-tête de ce fichier), rien à faire : l'événement devient une coquille
    -- sans staff, limite déjà inhérente à l'absence de la fonctionnalité
    -- co-organisateur, pas un nouveau problème introduit par ce trigger.
  end if;
  return OLD;
end;
$$;

drop trigger if exists event_staff_promote_successor on public.event_staff;

create trigger event_staff_promote_successor
before delete on event_staff
for each row
execute function event_staff_promote_successor_on_departure();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, avec un événement de
-- test ayant un organisateur unique + au moins un second membre du staff
-- "co_organizer" ou "moderator" — rare en pratique, voir ci-dessus, mais
-- simulable manuellement pour le test) :
--
-- -- 1. Avant : noter l'organisateur unique et un autre membre du staff.
-- select profile_id, role, created_at from event_staff
-- where event_id = '<uuid-evenement-test>' order by created_at;
--
-- -- 2. Simuler la cascade de suppression de compte (connecté en SQL Editor,
-- -- donc avec les droits service role qui contournent déjà la RLS, comme le
-- -- ferait réellement process-scheduled-deletions) :
-- delete from event_staff
-- where event_id = '<uuid-evenement-test>' and profile_id = '<uuid-profil-organisateur-unique>';
--
-- -- 3. Après : le "co_organizer" (ou "moderator" à défaut, ou le plus ancien
-- -- des restants) doit maintenant apparaître role='organizer' :
-- select profile_id, role, created_at from event_staff
-- where event_id = '<uuid-evenement-test>' order by created_at;
--
-- -- 4. Contrôle négatif : si un AUTRE 'organizer' existait déjà avant le
-- -- DELETE, aucune ligne ne doit changer de rôle suite à ce DELETE.
--
-- -- 5. Contrôle du cas majoritaire : un événement à staff unique (aucune
-- -- autre ligne "event_staff") doit se retrouver sans aucune ligne après le
-- -- DELETE de son organisateur unique — comportement attendu, pas un bug.
-- ============================================================================
