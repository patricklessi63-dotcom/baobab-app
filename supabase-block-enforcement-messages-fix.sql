-- ============================================================================
-- Correctif — une personne BLOQUÉE pouvait continuer à écrire à celle qui l'a bloquée.
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Découvert le 3 novembre 2026 par un essai réel sur le projet de répétition (deux comptes A et B :
-- A bloque B, puis B envoie encore un message à A — accepté, et B relit toute la conversation).
--
-- CAUSE : la policy INSERT de « messages » (et celles de ses sœurs) contient
--   NOT EXISTS (select 1 from blocks where (from = moi and to = lui) or (from = lui and to = moi))
-- mais une sous-requête de policy s'exécute avec les droits de l'APPELANT, donc soumise à la RLS de
-- « blocks » — dont la policy SELECT ne laisse voir à chacun que les blocages QU'IL a créés
-- (`blocks.from_id` = moi). La personne bloquée (to_id) ne voit pas le blocage : pour elle le
-- NOT EXISTS est toujours vrai. Seul le blocage « dans l'autre sens » est donc réellement appliqué.
--
-- CORRECTIF (additif, aucune policy existante modifiée ou supprimée, aucune RLS désactivée) :
--   1. fonction `is_blocked_pair(a, b)` SECURITY DEFINER (lit « blocks » sans RLS), qui ne répond que si
--      l'appelant est l'une des deux personnes (pas d'oracle sur les blocages des autres) ;
--   2. policy RESTRICTIVE sur messages (INSERT) : s'ajoute (ET logique) à la policy existante ;
--   3. policy RESTRICTIVE sur storage.objects (INSERT, bucket chat-media) : pas de téléversement non
--      plus dans le dossier d'une conversation bloquée ;
--   4. policy RESTRICTIVE sur message_reactions (INSERT).
-- Les lectures (SELECT) ne changent pas : la personne qui a bloqué garde son historique ; la personne
-- bloquée ne peut plus rien ENVOYER. Les tables likes / follows / favorites / event_invitations ont la
-- même faiblesse de conception : à traiter par la même méthode dans un second temps (voir LANCEMENT.md).
--
-- CONTRÔLES (à lancer avant / après, sur la répétition d'abord) :
--   -- avant : A bloque B, B insère -> accepté ; après : refusé par la RLS (42501).
--   select polname, polpermissive from pg_policy where polrelid = 'public.messages'::regclass;
--   -- doit montrer « messages_block_enforcement_insert » avec polpermissive = false.
--
-- RETOUR ARRIÈRE :
--   drop policy if exists "messages_block_enforcement_insert" on public.messages;
--   drop policy if exists "message_reactions_block_enforcement_insert" on public.message_reactions;
--   drop policy if exists "chat-media: blocage entre participants" on storage.objects;
--   drop function if exists public.is_blocked_pair(uuid, uuid);
--
-- Validé sur schéma factice PGlite (src/native/blockEnforcement.test.js) ET sur le projet de répétition
-- (scripts/staging-e2e.mjs) ; jamais sur la production.
-- ============================================================================

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1
           from public.profiles me
           where me.user_id = auth.uid()
             and me.id in (p_a, p_b)
         )
         and exists (
           select 1
           from public.blocks b
           where (b.from_id = p_a and b.to_id = p_b)
              or (b.from_id = p_b and b.to_id = p_a)
         );
$$;

revoke all on function public.is_blocked_pair(uuid, uuid) from public;
revoke all on function public.is_blocked_pair(uuid, uuid) from anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- Les deux personnes d'une conversation sont les deux uuid de match_key ("<uuid>__<uuid>").
drop policy if exists "messages_block_enforcement_insert" on public.messages;
create policy "messages_block_enforcement_insert"
on public.messages
as restrictive
for insert
to authenticated
with check (
  not public.is_blocked_pair(
    (string_to_array(match_key, '__'))[1]::uuid,
    (string_to_array(match_key, '__'))[2]::uuid
  )
);

drop policy if exists "message_reactions_block_enforcement_insert" on public.message_reactions;
create policy "message_reactions_block_enforcement_insert"
on public.message_reactions
as restrictive
for insert
to authenticated
with check (
  not exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
      and public.is_blocked_pair(
            (string_to_array(m.match_key, '__'))[1]::uuid,
            (string_to_array(m.match_key, '__'))[2]::uuid
          )
  )
);

-- Storage : le 1er segment du chemin est le match_key (voir supabase-chat-media-storage.sql).
drop policy if exists "chat-media: blocage entre participants" on storage.objects;
create policy "chat-media: blocage entre participants"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'chat-media'
  or not public.is_blocked_pair(
    (string_to_array((storage.foldername(name))[1], '__'))[1]::uuid,
    (string_to_array((storage.foldername(name))[1], '__'))[2]::uuid
  )
);
