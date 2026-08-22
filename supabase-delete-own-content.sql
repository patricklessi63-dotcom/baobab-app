-- ============================================================================
-- Suppression de ses propres communautes et evenements, + capacite
-- equivalente pour les admin/super_admin (is_admin_or_above(), deja
-- utilisee partout ailleurs dans supabase-admin.sql).
--
-- communities avait deja une policy DELETE proprietaire (jamais exposee
-- dans l'UI) -- on y ajoute seulement la policy admin. events n'avait
-- volontairement aucune policy DELETE (l'annulation via canceled_at etait
-- preferee) ; on ajoute ici une vraie suppression pour le createur et les
-- admin, les tables enfants (event_attendees, event_staff, event_comments,
-- event_media, event_reports) sont deja en "on delete cascade".
-- ============================================================================

drop policy if exists "Un admin supprime n'importe quelle communaute" on communities;
create policy "Un admin supprime n'importe quelle communaute"
on communities for delete
using (is_admin_or_above());

drop policy if exists "Le createur supprime son evenement" on events;
create policy "Le createur supprime son evenement"
on events for delete
using (created_by = current_profile_id());

drop policy if exists "Un admin supprime n'importe quel evenement" on events;
create policy "Un admin supprime n'importe quel evenement"
on events for delete
using (is_admin_or_above());

-- ----------------------------------------------------------------------------
-- Verification (facultatif) :
-- select policyname, cmd from pg_policies where tablename in ('communities','events') and cmd = 'DELETE';
-- ============================================================================
