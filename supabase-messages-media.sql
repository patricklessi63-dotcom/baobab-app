-- ============================================================================
-- Phase 5.5 (addendum) — Messagerie riche : schéma polymorphe des messages.
-- À exécuter dans Supabase : SQL Editor (une fois).
-- ============================================================================
-- Architecture polymorphe à une seule table (pas de table par type de
-- média) : "kind" distingue text/image/video/audio/file/sticker,
-- "media_path" pointe vers un objet du bucket Storage privé "chat-media"
-- (jamais une URL — le bucket est privé, les URLs signées sont générées
-- côté client à l'affichage), "media_meta" (jsonb) porte les métadonnées
-- spécifiques au type (nom original, mime, taille, durée, dimensions, ou
-- pour un sticker : emoji/légende/dégradé).

alter table messages add column if not exists kind text not null default 'text';
alter table messages add column if not exists media_path text;
alter table messages add column if not exists media_meta jsonb;

-- Un message texte pouvait auparavant seul exister ; un message média n'a
-- pas forcément de légende. Précédent déjà établi dans ce dépôt :
-- supabase-stories-media.sql a fait le même changement pour stories.text.
alter table messages alter column text drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_kind_check') then
    alter table messages add constraint messages_kind_check
      check (kind in ('text','image','video','audio','file','sticker'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_kind_shape_check') then
    alter table messages add constraint messages_kind_shape_check
      check (
        (kind = 'text' and text is not null and text <> '' and media_path is null)
        or (kind = 'sticker' and media_path is null and media_meta ? 'emoji')
        or (kind in ('image','video','audio','file') and media_path is not null)
      );
  end if;
end $$;

-- Aucun changement aux policies SELECT/INSERT existantes sur "messages" —
-- elles filtrent sur match_key/from_id, inchangés par cet ajout.

-- Défense en profondeur mise à jour : le trigger existant
-- (supabase-messaging.sql) ne bloquait la mutation post-insertion que de
-- text/from_id/match_key/created_at. Redéfini ici (idempotent via
-- "create or replace") pour bloquer aussi kind/media_path/media_meta —
-- sinon la garantie "seul read_at est modifiable" a un trou.
create or replace function messages_restrict_update_to_read_at()
returns trigger language plpgsql as $$
begin
  if new.text is distinct from old.text
     or new.from_id is distinct from old.from_id
     or new.match_key is distinct from old.match_key
     or new.created_at is distinct from old.created_at
     or new.kind is distinct from old.kind
     or new.media_path is distinct from old.media_path
     or new.media_meta is distinct from old.media_meta then
    raise exception 'Seul read_at peut etre modifie sur un message existant.';
  end if;
  return new;
end;
$$;
-- Le trigger "messages_restrict_update" existant continue de pointer vers
-- cette fonction — "create or replace" suffit, pas besoin de DROP/CREATE TRIGGER.

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name, is_nullable from information_schema.columns
-- where table_name='messages' and column_name in ('kind','media_path','media_meta','text');
-- select conname from pg_constraint where conname in ('messages_kind_check','messages_kind_shape_check');
-- ============================================================================
