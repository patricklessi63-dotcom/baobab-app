-- ============================================================================
-- CORRECTIF — colonnes sensibles de "event_media" modifiables directement
-- par un simple UPDATE de l'application (contournement des restrictions
-- d'appartenance/moderation deja en place a l'INSERT).
--
-- Trouve lors du croisement exhaustif du 8 septembre 2026, angle "policy RLS
-- UPDATE trop permissive au niveau colonne — le proprietaire peut
-- legitimement modifier SA ligne mais pas n'importe quelle colonne dedans",
-- applique a TOUTES les tables du projet (suite a
-- supabase-profile-trust-columns-protect-fix.sql, qui ne traitait que
-- "profiles"). Tables verifiees sans nouveau probleme : subscriptions/
-- subscription_events (aucune policy UPDATE cliente), community_members et
-- event_staff (deja restreints par hierarchie de role, cf. commentaire "item
-- 28" dans supabase-communities.sql), community_join_requests (aucune
-- policy UPDATE, statut change uniquement via RPC SECURITY DEFINER),
-- messages (deja protegee colonne par colonne par
-- enforce_message_update_rules, supabase-messaging-2.sql), likes/passes/
-- blocks/follows/favorites/post_likes/community_post_likes/story_reactions/
-- post_reports/community_reports/event_reports/info_reports (aucune policy
-- UPDATE cliente, ou repointage de cle etrangere deja possible via INSERT
-- donc pas une escalade nouvelle). Un seul cas confirme : "event_media".
--
-- Constat : supabase-events-v2.sql (et sa redefinition identique dans
-- supabase-scale-security-2.sql) definit
--   on event_media for update
--   using (uploaded_by = current_profile_id() or is_event_mod(event_id))
--   with check (uploaded_by = current_profile_id() or is_event_mod(event_id));
-- Le with check n'est satisfait que par la condition OR "uploaded_by =
-- current_profile_id()" pour un simple participant qui garde son propre id
-- comme uploaded_by — ce qui rend "event_id" et "status" librement
-- modifiables sur sa propre ligne, sans plus aucun rapport avec les
-- restrictions imposees a l'INSERT :
--   - "event_id" : la policy INSERT exige d'etre participant/staff de
--     l'evenement cible ("Un participant partage une photo"). Un simple
--     UPDATE de sa propre ligne event_media permet de reassigner event_id
--     vers N'IMPORTE QUEL AUTRE evenement (y compris un evenement prive
--     dont on n'est ni participant ni staff), sans jamais repasser par
--     cette verification.
--   - "status" ('visible'/'hidden'/'removed') : colonne de moderation
--     normalement pilotee par le staff de l'evenement (policy "L'auteur ou
--     le staff modifie une photo" combine les deux usages dans la meme
--     policy). Un simple auteur peut aujourd'hui remettre lui-meme
--     status='visible' sur une photo que le staff venait de masquer/retirer
--     pour non-conformite — la moderation est totalement contournable.
-- ("uploaded_by" n'a pas besoin d'un traitement separe : le with check
-- existant bloque deja sa reassignation vers un tiers, la nouvelle valeur
-- devant satisfaire elle-meme "= current_profile_id() ou is_event_mod(...)".)
--
-- Verifie : src/components/social/EventsTab.jsx n'appelle jamais
-- .update() sur "event_media" (seulement .insert() et .delete()) — ce
-- correctif ne retire donc aucune fonctionnalite existante de
-- l'application, il ferme uniquement une possibilite d'appel direct via
-- l'API Supabase (hors interface).
--
-- Ordre d'execution : a executer APRES supabase-events-v2.sql (et
-- supabase-scale-security-2.sql si deja applique) — la table et la
-- fonction is_event_mod() doivent deja exister. "create or replace
-- function" et "drop trigger if exists" rendent ce fichier idempotent.
-- ============================================================================

create or replace function protect_event_media_columns()
returns trigger language plpgsql as $$
begin
  -- Aucun cas d'usage reel (ni dans l'app, ni cote staff) ne deplace une
  -- photo existante vers un autre evenement : plus simple et plus sur de
  -- l'interdire completement plutot que de re-verifier l'appartenance au
  -- nouvel evenement a chaque fois.
  if new.event_id is distinct from old.event_id then
    raise exception 'Impossible de deplacer une photo vers un autre evenement.';
  end if;

  -- Le statut de moderation ne peut etre change que par le staff de
  -- l'evenement (organizer/co_organizer/moderator) — jamais par l'auteur
  -- de la photo lui-meme, sous peine de pouvoir annuler sa propre
  -- moderation.
  if new.status is distinct from old.status and not is_event_mod(old.event_id) then
    raise exception 'Seul le staff de l''evenement peut changer le statut d''une photo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_event_media_columns on event_media;
create trigger trg_protect_event_media_columns
before update on event_media
for each row
execute function protect_event_media_columns();

-- ----------------------------------------------------------------------------
-- Verification (facultatif, a executer separement apres) :
--
-- -- en tant qu'auteur de la photo (pas staff) :
-- update event_media set event_id = '<uuid_autre_evenement>' where id = '<ma_photo>';
-- -- doit lever : "Impossible de deplacer une photo vers un autre evenement."
-- update event_media set status = 'visible' where id = '<ma_photo_masquee_par_le_staff>';
-- -- doit lever : "Seul le staff de l'evenement peut changer le statut..."
--
-- -- en tant que staff (organizer/co_organizer/moderator) de l'evenement :
-- update event_media set status = 'hidden' where id = '<photo_dans_mon_evenement>';
-- -- doit toujours reussir (moderation normale, inchangee).
--
-- select tgname from pg_trigger where tgname = 'trg_protect_event_media_columns';
-- ============================================================================
