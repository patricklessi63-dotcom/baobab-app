-- ============================================================================
-- CORRECTIF — promote_from_waitlist() : une place libérée sur deux peut ne
-- jamais être proposée à la liste d'attente lors d'une double désinscription
-- quasi simultanée (trouvé lors de l'audit du mécanisme de promotion de la
-- liste d'attente des événements, 25 septembre 2026 — le mécanisme de mise
-- en liste d'attente elle-même avait déjà été audité, pas sa promotion).
--
-- Scénario concret : événement plafonné à 10 places, complet (10 "going"),
-- deux personnes en liste d'attente W1 (inscrite en premier) et W2. Deux
-- participants "going" A et B quittent l'événement à quelques millisecondes
-- d'écart (chacun via un simple DELETE sur event_attendees déclenché depuis
-- l'app — voir handleLeave dans EventsTab.jsx — donc deux transactions
-- distinctes qui s'exécutent en parallèle, pas une seule).
--
-- Le trigger trg_promote_waitlist (AFTER UPDATE OR DELETE) se déclenche une
-- fois par transaction. Contrairement à join_event()/accept_event_invitation()
-- (supabase-events-v2.sql), qui verrouillent explicitement la ligne "events"
-- ('for update') avant de décider going/waitlisted pour éviter exactement ce
-- genre de course, promote_from_waitlist() ne pose aucun verrou :
--   - Les deux transactions comptent les "going" avant que l'autre n'ait
--     validé (isolation READ COMMITTED par défaut) : chacune calcule 9/10 et
--     conclut donc qu'une place est libre.
--   - Les deux sélectionnent le MÊME candidat W1 ("order by updated_at asc
--     limit 1"), car aucune ne voit encore la promotion en cours de l'autre.
--   - La deuxième transaction à écrire bloque sur le verrou de ligne posé par
--     la première (l'"update ... where id = v_next.id" cible la même ligne),
--     puis, une fois débloquée, réexécute quand même son propre update par id
--     — sans revérifier que le statut est toujours 'waitlisted' — donc W1 est
--     promu et notifié DEUX FOIS, et W2 n'est JAMAIS promu alors qu'une
--     seconde place s'est bel et bien libérée.
-- Résultat : une place reste vacante indéfiniment (rien ne la propose à W2 —
-- le trigger ne se redéclenche que sur un futur UPDATE/DELETE "going" sur cet
-- événement, jamais sur un INSERT), et W1 reçoit une notification
-- "event_waitlist_promoted" en double.
--
-- Correctif : verrouille la ligne "events" ('for update') en tout début de
-- fonction — exactement le même verrou que join_event()/
-- accept_event_invitation() posent déjà pour la même raison — ce qui
-- sérialise les déclenchements concurrents du trigger sur un même événement :
-- la seconde transaction ne recalcule son compte "going" et ne choisit son
-- candidat qu'après que la première a validé sa propre promotion, et voit
-- donc correctement W1 déjà promu pour sélectionner W2. On verrouille aussi
-- la ligne candidate ('for update') et on ajoute "and status = 'waitlisted'"
-- dans l'UPDATE final, par défense en profondeur : sans effet une fois le
-- verrou sur "events" en place, mais rend la fonction sûre même appelée hors
-- du contexte normal du trigger. La notification n'est envoyée que si
-- l'UPDATE a bien affecté une ligne (plus de notification fantôme si la
-- ligne avait déjà changé de statut entre-temps).
--
-- Additif, idempotent (create or replace + drop trigger if exists / create
-- trigger), sûr à rejouer. Ne modifie aucune donnée existante. À exécuter
-- après supabase-events-v2.sql.
-- ============================================================================

create or replace function promote_from_waitlist()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_max int; v_going int; v_next event_attendees;
begin
  v_event_id := coalesce(old.event_id, new.event_id);

  if old.status <> 'going' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.status = 'going' then
    return new;
  end if;

  -- Verrou sur la ligne "events" : sérialise les déclenchements concurrents
  -- de ce trigger pour le même événement (même verrou, pour la même raison,
  -- que join_event()/accept_event_invitation()).
  select max_participants into v_max from events where id = v_event_id for update;
  if v_max is null then return coalesce(new, old); end if;

  select count(*) into v_going from event_attendees where event_id = v_event_id and status = 'going';
  if v_going >= v_max then return coalesce(new, old); end if;

  select * into v_next from event_attendees
    where event_id = v_event_id and status = 'waitlisted'
    order by updated_at asc limit 1
    for update;
  if found then
    update event_attendees set status = 'going', updated_at = now()
      where id = v_next.id and status = 'waitlisted';
    if found then
      insert into notifications (recipient_id, type, actor_id, target_type, target_id)
      values (v_next.profile_id, 'event_waitlist_promoted', v_next.profile_id, 'event', v_event_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_promote_waitlist on event_attendees;
create trigger trg_promote_waitlist after update or delete on event_attendees
for each row execute function promote_from_waitlist();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- -- avec un événement plafonné complet et 2 personnes en liste d'attente,
-- -- ouvrir deux sessions/transactions et faire quitter deux "going"
-- -- distincts en parallèle (ou simuler avec deux `begin; ... ;` imbriqués,
-- -- la seconde bloquant sur `for update` avant que la première ne fasse
-- -- `commit`) : les deux personnes en attente doivent être promues (une
-- -- chacune), pas la même deux fois.
-- ============================================================================
