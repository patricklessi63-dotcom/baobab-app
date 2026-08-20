-- BAOBAB — Messagerie 2.0 : réactions, réponses, suppression
-- La messagerie existante (envoi, realtime INSERT, lecture, médias, RLS
-- blocage bidirectionnel sur messages.INSERT, marquage "lu") était déjà
-- solide et n'est pas touchée ici. Ce script ajoute uniquement ce qui
-- manquait.

alter table public.messages add column if not exists reply_to_id bigint references public.messages(id) on delete set null;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists deleted_by uuid;
alter table public.messages add column if not exists deleted_for uuid[] not null default '{}';

-- Verrou au niveau colonne (indépendant des policies RLS, qui ne gèrent
-- que l'accès par ligne) :
--  - le contenu d'un message n'est jamais modifiable après envoi
--    (empêche toute falsification de l'historique) ;
--  - seul l'auteur peut déclencher "supprimer pour tout le monde"
--    (deleted_at/deleted_by) — jamais un simple participant ;
--  - "supprimer pour moi" (deleted_for) ne peut qu'ajouter SON PROPRE id,
--    jamais retirer une entrée ni en ajouter une autre.
create or replace function public.enforce_message_update_rules()
returns trigger
language plpgsql
as $$
declare
  my_profile_id uuid;
begin
  select id into my_profile_id from public.profiles where user_id = auth.uid();

  if new.text is distinct from old.text
     or new.media_path is distinct from old.media_path
     or new.kind is distinct from old.kind
     or new.from_id is distinct from old.from_id
     or new.match_key is distinct from old.match_key
     or new.media_meta is distinct from old.media_meta
     or new.reply_to_id is distinct from old.reply_to_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Le contenu d''un message ne peut pas être modifié après envoi.';
  end if;

  if (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by)
     and old.from_id <> my_profile_id then
    raise exception 'Seul l''auteur peut supprimer ce message pour tout le monde.';
  end if;

  if new.deleted_for is distinct from old.deleted_for then
    if not (old.deleted_for <@ new.deleted_for)
       or not (new.deleted_for <@ (old.deleted_for || my_profile_id))
    then
      raise exception 'Modification de deleted_for non autorisée.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_message_update_rules on public.messages;
create trigger trg_enforce_message_update_rules
  before update on public.messages
  for each row execute function public.enforce_message_update_rules();

-- Autorise tout participant de la conversation à modifier une ligne
-- (uniquement pour deleted_at/deleted_by/deleted_for — le trigger
-- ci-dessus arbitre qui a le droit de toucher quelle colonne). La policy
-- de marquage "lu" déjà existante n'est pas touchée, ces deux policies
-- coexistent (RLS combine les policies permissives avec OR).
drop policy if exists "messages_participant_update" on public.messages;
create policy "messages_participant_update" on public.messages for update
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.id::text = any(string_to_array(messages.match_key, '__'))
    )
  )
  with check (true);

-- Réactions — la lecture/écriture s'appuie sur la policy SELECT déjà
-- existante de "messages" (un utilisateur ne peut réagir/voir une réaction
-- que sur un message qu'il peut déjà lire, donc dans sa propre conversation).
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

alter table public.message_reactions enable row level security;

drop policy if exists "message_reactions_select" on public.message_reactions;
create policy "message_reactions_select" on public.message_reactions for select
  using (exists (select 1 from public.messages m where m.id = message_reactions.message_id));

drop policy if exists "message_reactions_insert_own" on public.message_reactions;
create policy "message_reactions_insert_own" on public.message_reactions for insert
  with check (
    profile_id = (select id from public.profiles where user_id = auth.uid())
    and exists (select 1 from public.messages m where m.id = message_reactions.message_id)
  );

drop policy if exists "message_reactions_delete_own" on public.message_reactions;
create policy "message_reactions_delete_own" on public.message_reactions for delete
  using (profile_id = (select id from public.profiles where user_id = auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
