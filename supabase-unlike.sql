-- ============================================================================
-- Like réversible (unlike). À exécuter dans Supabase : SQL Editor.
-- Indépendant des autres fichiers SQL de cette session.
-- ============================================================================
-- Corrige un gap identifié dans le nouveau prompt maître : le "like" était
-- une action irréversible (aucune policy DELETE sur "likes", aucune fonction
-- "unlike" côté client). Périmètre assumé : unlike autorisé uniquement AVANT
-- qu'un match ne soit formé (le bouton J'aime/like disparaît déjà une fois
-- matché, comportement client existant conservé) — défaire un match complet
-- est un chantier à part (pas de table "matches" dédiée, le match est
-- aujourd'hui purement dérivé des lignes "likes" mutuelles côté client).

-- ----------------------------------------------------------------------------
-- 1. Policy DELETE sur "likes" — n'existait pas (confirmé par audit).
-- Calquée sur celle déjà existante pour "blocks" (supabase-matching.sql).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'likes' and cmd = 'DELETE' loop
    execute format('drop policy %I on public.likes', pol.policyname);
  end loop;

  create policy "Un utilisateur retire son propre like"
  on likes for delete
  using (auth.uid() = (select user_id from profiles where id = likes.from_id));
end $$;

-- ----------------------------------------------------------------------------
-- 2. notify_like() — idempotence ajoutée : évite une notification "new_like"
-- dupliquée si l'utilisateur fait like → unlike → like plusieurs fois de
-- suite (le trigger reste AFTER INSERT ONLY, unlike ne le refait jamais
-- fire — voir absence volontaire de trigger AFTER DELETE ici).
-- ----------------------------------------------------------------------------
create or replace function notify_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from notifications
    where recipient_id = new.to_id and actor_id = new.from_id and type = 'new_like'
  ) then
    insert into notifications (recipient_id, actor_id, type, target_type, target_id)
    values (new.to_id, new.from_id, 'new_like', 'profile', new.from_id);
  end if;

  if exists (select 1 from likes where from_id = new.to_id and to_id = new.from_id) then
    insert into notifications (recipient_id, actor_id, type, target_type, target_id)
    values
      (new.from_id, new.to_id, 'new_match', 'profile', new.to_id),
      (new.to_id, new.from_id, 'new_match', 'profile', new.from_id);
  end if;
  return new;
end; $$;
-- Le trigger trg_notify_like existant continue de pointer vers cette
-- fonction (create or replace la remplace en place, pas besoin de
-- recréer le trigger).

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd from pg_policies where tablename = 'likes';
-- select proname from pg_proc where proname = 'notify_like';
-- ============================================================================
