-- ============================================================================
-- Phase 11 — Bêta privée : catégories de retour rapide (👍/👎/🐛/💡)
-- Additif à supabase-beta-tracking.sql (table beta_feedback déjà créée et
-- exécutée). À exécuter dans Supabase : SQL Editor (une fois).
-- ============================================================================

alter table beta_feedback add column if not exists category text
  check (category in ('jaime', 'jaime_pas', 'bug', 'suggestion'));

-- Le message reste la donnée principale, mais un tap sur une réaction rapide
-- sans commentaire doit rester possible (le signal 👍/👎 seul est déjà
-- utile) — on assouplit la contrainte minimale de longueur uniquement
-- quand une catégorie est renseignée.
alter table beta_feedback drop constraint if exists beta_feedback_message_check;
alter table beta_feedback add constraint beta_feedback_message_check
  check (
    char_length(message) between 1 and 2000
    or (category is not null and message = '')
  );
